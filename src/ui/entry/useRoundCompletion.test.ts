import { act, cleanup, render, renderHook, waitFor } from '@testing-library/preact';
import { h } from 'preact';
import { afterEach, expect, test } from 'vitest';
import { deleteDB } from 'idb';
import { buildContainer, ContainerContext } from '../../app/container';
import type { Container } from '../../app/container';
import { createLogger } from '../../app/logger';
import { Router } from '../../app/router';
import { createStorage, StorageError } from '../../storage';
import type { Storage } from '../../storage';
import { hole, play } from '../../storage/__tests__/support';
import { useRoundSession } from './useRoundSession';
import { useRoundCompletion } from './useRoundCompletion';
import { FinishRound } from './TheTurn';
import { userEvent } from 'vitest/browser';
import { expectAccessible } from '../kit/__tests__/support';

const containers: Container[] = []; const names = new Set<string>();
async function open(decorate?: (storage: Storage) => Storage): Promise<Container> {
  const name = `completion-${crypto.randomUUID()}`; names.add(name);
  const c = await buildContainer({ dbName: name, logger: createLogger({ level: 'fatal' }), today: () => '2026-10-15',
    storageFactory: async (dbName, options) => { const storage = await createStorage(dbName, options); return decorate?.(storage) ?? storage; } });
  containers.push(c); return c;
}
function harness(c: Container): ReturnType<typeof renderHook<ReturnType<typeof useRoundCompletion>, unknown>> {
  render(h(ContainerContext.Provider, { value: c }, h(Router, { routes: [
    { path: '/round/:id/summary', view: () => h('h2', null, 'Committed summary') },
    { path: '/round/hole/:n', view: () => h('h2', null, 'Hole editor') },
    { path: '/log', view: () => h('h2', null, 'Round log') },
  ] })));
  return renderHook(() => useRoundCompletion(useRoundSession(c), c));
}
afterEach(async () => { cleanup(); for (const c of containers.splice(0)) c.close(); for (const name of names) await deleteDB(name); names.clear(); window.history.replaceState(null, '', '/'); });

test.each([9, 18])('%s-hole finish commits before showing summary and guards duplicate actions', async (count) => {
  const c = await open(); const round = await play(c.repository, count); await c.session.load();
  const { result } = harness(c);
  expect(result.current.step).toBe(count === 9 ? 'turn' : 'finish');
  await act(async () => { await Promise.all([result.current.finish(), result.current.finish()]); });
  expect((await c.repository.getRound(round.id)).status).toBe('finished');
  expect(window.location.hash).toBe(`#/round/${round.id}/summary`);
});

test('failed continue retains turn; retry commits before a later read resumes hole ten', async () => {
  let fail = true;
  const c = await open((storage) => ({ ...storage, repository: { ...storage.repository,
    async continueRound(id, revision) { if (fail) throw new StorageError('io', 'Continue could not commit.'); return storage.repository.continueRound(id, revision); },
  } }));
  await play(c.repository, 9); await c.session.load(); const { result } = harness(c);
  await act(async () => { await expect(result.current.continueToTen()).rejects.toMatchObject({ kind: 'io' }); });
  expect(c.session.getSnapshot().round?.continuedTo18).toBe(false); expect(result.current.step).toBe('turn');
  fail = false; await act(async () => { await c.session.retry(); });
  expect(c.session.getSnapshot().round?.continuedTo18).toBe(true); expect(result.current.step).toBe('enter-hole');
});

test('failed finish keeps eighteen holes in progress and retry commits once', async () => {
  let fail = true;
  const c = await open((storage) => ({ ...storage, repository: { ...storage.repository,
    async finishRound(id, revision) { if (fail) throw new StorageError('io', 'Finish could not commit.'); return storage.repository.finishRound(id, revision); },
  } }));
  const round = await play(c.repository, 18); await c.session.load(); const { result } = harness(c);
  await act(async () => { await expect(result.current.finish()).rejects.toMatchObject({ kind: 'io' }); });
  expect(result.current.step).toBe('finish'); expect((await c.repository.getRound(round.id)).status).toBe('in-progress');
  fail = false; await act(async () => c.session.retry());
  expect((await c.repository.getRound(round.id)).status).toBe('finished');
});

test('unfinished correction can be confirmed unchanged after a failed finish', async () => {
  const c = await open(); await play(c.repository, 9); await c.session.load();
  const draft = { ...hole(1), strokes: 5 }; await c.session.saveDraft(draft);
  const { result } = harness(c);
  await act(async () => { await expect(result.current.finishAtNine()).rejects.toMatchObject({ kind: 'invalid' }); });
  await act(async () => c.session.correct(draft));
  expect(c.session.getSnapshot().error).toBeNull();
  await act(async () => result.current.finishAtNine());
  expect(c.session.getSnapshot().round?.status).toBe('finished');
});

test('abandon flushes rapid input, reads latest revision and Undo restores the complete draft', async () => {
  const c = await open(); await c.session.start(); await c.session.save(hole(1));
  const { result } = harness(c);
  const draft = { ...hole(2), strokes: 1, putts: 4, fairway: null };
  await act(async () => {
    const saving = c.session.saveDraft(draft);
    await result.current.abandon(); await saving;
  });
  expect(c.session.getSnapshot().round).toBeNull(); expect(window.location.hash).toBe('#/log');
  expect(c.undo.getSnapshot().item?.round.drafts[2]).toEqual(draft);
  await act(async () => result.current.restore());
  expect(c.session.getSnapshot().round?.drafts[2]).toEqual(draft);
  expect(window.location.hash).toBe('#/round/hole/2');
});

test('failed abandonment leaves active scorecard and drafts available for retry', async () => {
  let fail = true;
  const c = await open((storage) => ({ ...storage, trash: { ...storage.trash,
    async removeRound(id, revision) { if (fail) throw new StorageError('io', 'Removal failed.'); return storage.trash.removeRound(id, revision); },
  } }));
  await c.session.start(); await c.session.saveDraft({ ...hole(1), strokes: 5 });
  const { result } = harness(c);
  await act(async () => { await expect(result.current.abandon()).rejects.toMatchObject({ kind: 'io' }); });
  expect(c.session.getSnapshot().round?.drafts[1]?.strokes).toBe(5); expect(c.undo.getSnapshot().item).toBeNull();
  fail = false; await act(async () => result.current.abandon());
  expect(c.undo.getSnapshot().item?.round.drafts[1]?.strokes).toBe(5);
});

test('persisted eighteen-hole route attempts finish once, exposes failure and retries without losing scores', async () => {
  let fail = true; let attempts = 0;
  const c = await open((storage) => ({ ...storage, repository: { ...storage.repository,
    async finishRound(id, revision) { attempts += 1; if (fail) throw new StorageError('io', 'Finalisation could not commit.'); return storage.repository.finishRound(id, revision); },
  } }));
  const round = await play(c.repository, 18); await c.session.load();
  window.history.replaceState(null, '', '#/round/finish');
  const view = render(h(ContainerContext.Provider, { value: c }, h('main', null, h('h1', null, 'Golf Scorecard'), h(Router, { routes: [
    { path: '/round/finish', view: FinishRound },
    { path: '/round/:id/summary', view: () => h('h2', null, 'Committed summary') },
  ] }))));
  await waitFor(() => expect(view.getAllByText('Finalisation could not commit.').length).toBeGreaterThan(0));
  expect(attempts).toBe(1); expect((await c.repository.getRound(round.id)).status).toBe('in-progress');
  await expectAccessible(view.container);
  fail = false; await userEvent.click(view.getByRole('button', { name: 'Retry saving' }));
  await waitFor(() => expect(view.getByRole('heading', { name: 'Committed summary' })).toBeTruthy());
  expect(attempts).toBe(2); expect((await c.repository.getRound(round.id)).holes).toHaveLength(18);
});
