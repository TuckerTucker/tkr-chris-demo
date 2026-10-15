import { act, cleanup, renderHook, waitFor } from '@testing-library/preact';
import { afterEach, expect, test } from 'vitest';
import { deleteDB } from 'idb';
import { buildContainer } from '../../app/container';
import type { Container } from '../../app/container';
import { createLogger } from '../../app/logger';
import { createStorage, StorageError } from '../../storage';
import type { RoundRepository } from '../../storage';
import { hole } from '../../storage/__tests__/support';
import { useRoundSession } from './useRoundSession';
import { useHoleEditor } from './useHoleEditor';

const containers: Container[] = [];
const names = new Set<string>();
async function open(name = `entry-${crypto.randomUUID()}`, decorate?: (repository: RoundRepository) => RoundRepository): Promise<Container> {
  names.add(name);
  const c = await buildContainer({ dbName: name, logger: createLogger({ level: 'fatal' }), today: () => '2026-10-15',
    storageFactory: async (dbName, opts) => { const storage = await createStorage(dbName, opts);
      return decorate ? { ...storage, repository: decorate(storage.repository) } : storage; } });
  containers.push(c); return c;
}
afterEach(async () => { cleanup(); for (const c of containers.splice(0)) c.close(); for (const name of names) await deleteDB(name); names.clear(); });

test('rapid edits queue before confirmation, double confirmation appends once', async () => {
  const c = await open(); await c.session.start();
  const { result } = renderHook(() => {
    const session = useRoundSession(c);
    const editor = useHoleEditor({ holeNumber: 1, suggestedPar: 4, onDraftChange: (draft) => { void session.saveDraft(draft).catch(() => undefined); } });
    return { session, editor };
  });
  await act(async () => {
    result.current.editor.set('strokes', 6); result.current.editor.set('putts', 3); result.current.editor.set('fairway', 'hit');
    const value = result.current.editor.toHole();
    await Promise.all([result.current.session.save(value), result.current.session.save(value)]);
  });
  await waitFor(() => expect(result.current.session.saveState).toBe('saved'));
  expect(result.current.session.round?.holes).toEqual([{ ...hole(1), strokes: 6, putts: 3 }]);
  expect(result.current.session.totals.strokes).toBe(6);
  expect(result.current.session.round?.drafts).toEqual({});
});

test('invalid draft, cursor and confirmed-only totals survive a real close/reopen', async () => {
  const name = `entry-reopen-${crypto.randomUUID()}`;
  const c = await open(name); await c.session.start(); await c.session.save(hole(1));
  await c.session.saveDraft({ ...hole(2), strokes: 1, putts: 4, fairway: null });
  c.close(); const reopened = await open(name);
  const { result } = renderHook(() => useRoundSession(reopened));
  expect(result.current.currentHole).toBe(2); expect(result.current.totals.strokes).toBe(4);
  expect(result.current.round?.drafts[2]).toEqual({ ...hole(2), strokes: 1, putts: 4, fairway: null });
});

test('failed write retains latest local edits and retry durably saves them', async () => {
  let fail = true;
  const c = await open(undefined, (repository) => ({ ...repository,
    async saveDraft(id, draft, revision) { if (fail) throw new StorageError('io', 'Injected disk write failure.'); return repository.saveDraft(id, draft, revision); },
  }));
  await c.session.start();
  const { result } = renderHook(() => useRoundSession(c));
  await act(async () => { await expect(result.current.saveDraft({ ...hole(1), strokes: 5 })).rejects.toMatchObject({ kind: 'io' }); });
  await act(async () => { await expect(result.current.saveDraft({ ...hole(1), strokes: 7 })).rejects.toMatchObject({ kind: 'io' }); });
  expect(result.current.localDrafts[1]?.strokes).toBe(7); expect(result.current.saveState).toBe('error');
  fail = false; await act(async () => result.current.retry());
  expect(result.current.round?.drafts[1]?.strokes).toBe(7); expect(result.current.saveState).toBe('saved');
  expect(result.current.totals.holesPlayed).toBe(0);
});

test('correcting an old hole keeps the next-hole draft and atomically updates par memory', async () => {
  const c = await open(); await c.session.start(); await c.session.save(hole(1));
  await c.session.saveDraft({ ...hole(2), strokes: 6 });
  const { result } = renderHook(() => useRoundSession(c));
  await act(async () => result.current.correct({ ...hole(1, 3), strokes: 3 }));
  expect(result.current.totals.strokes).toBe(3); expect(result.current.round?.drafts[2]?.strokes).toBe(6);
  expect(result.current.round?.activeHole).toBe(2); expect(await c.parMemory.lastPar(1)).toBe(3);
});

test('conflicts expose both versions, retry refuses, explicit reapply stays a draft', async () => {
  const c = await open(); await c.session.start(); await c.session.save(hole(1));
  await c.session.saveDraft({ ...hole(1), strokes: 5 });
  const round = c.session.getSnapshot().round;
  if (!round) throw new Error('Round missing');
  await c.repository.updateHole(round.id, { ...hole(1), strokes: 6 }, round.revision);
  const { result } = renderHook(() => useRoundSession(c));
  await act(async () => { await expect(result.current.saveDraft({ ...hole(1), strokes: 7 })).rejects.toMatchObject({ kind: 'conflict' }); });
  expect(result.current.localDrafts[1]?.strokes).toBe(7); expect(result.current.conflictRound?.holes[0]?.strokes).toBe(6);
  await act(async () => { await expect(result.current.retry()).rejects.toMatchObject({ kind: 'conflict' }); });
  await act(async () => c.session.resolveConflict('reapply'));
  expect(result.current.round?.holes[0]?.strokes).toBe(6); expect(result.current.round?.drafts[1]?.strokes).toBe(7);
  await act(async () => result.current.correct({ ...hole(1), strokes: 7 }));
  expect(result.current.round?.holes[0]?.strokes).toBe(7);
});
