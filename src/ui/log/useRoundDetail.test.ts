import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/preact';
import { h } from 'preact';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { buildContainer } from '../../app/container';
import type { Container } from '../../app/container';
import { App } from '../../app/App';
import { createLogger } from '../../app/logger';
import { createThemeController } from '../../app/theme';
import { createStorage, StorageError } from '../../storage';
import type { Storage, StoredRound } from '../../storage';
import { databaseFixture, hole, play } from '../../storage/__tests__/support';
import { useRoundDetail } from './useRoundDetail';

let fixture: ReturnType<typeof databaseFixture>;
let c: Container;
let storage: Storage;
const others: Container[] = [];
const paths: string[] = [];
const go = async (path: string): Promise<void> => { paths.push(path); };
beforeEach(async () => {
  fixture = databaseFixture(); paths.length = 0;
  c = await buildContainer({ dbName: fixture.name, logger: createLogger({ level: 'fatal' }),
    storageFactory: async (name, options) => { storage = await createStorage(name, options); return storage; } });
});
afterEach(async () => {
  cleanup(); c.close(); for (const other of others.splice(0)) other.close();
  const drain = await fixture.open();
  await drain.transaction(['rounds', 'trash', 'par-memory'], 'readwrite').done;
  await fixture.cleanup();
  window.history.replaceState(null, '', window.location.pathname);
});
async function finished(): Promise<StoredRound> {
  const round = await play(c.repository, 9);
  return await c.repository.finishRound(round.id, round.revision);
}
async function reopen(): Promise<Container> {
  const other = await buildContainer({ dbName: fixture.name, logger: createLogger({ level: 'fatal' }) });
  others.push(other); return other;
}

test('isolated correction restores its cursor, cancel preserves confirmed values and other drafts', async () => {
  let round = await finished();
  round = await c.repository.saveDraft(round.id, { ...hole(1), strokes: 6 }, round.revision);
  round = await c.repository.saveDraft(round.id, { ...hole(2), putts: 1 }, round.revision);
  const { result } = renderHook(() => useRoundDetail(c, round.id, go));
  await waitFor(() => expect(result.current.editing).toBe(2));
  expect(c.session.getSnapshot().round).toBeNull();
  expect(result.current.totals?.strokes).toBe(36);
  await act(async () => { await result.current.cancel(); });
  expect(result.current.editing).toBe(1);
  expect(result.current.round?.drafts[1]?.strokes).toBe(6);
  expect(result.current.round?.drafts[2]).toBeUndefined();
  expect(result.current.round?.holes).toEqual(round.holes);
});

test('autosaved correction survives hook restart; confirming changes totals and par memory atomically', async () => {
  const round = await finished();
  const first = renderHook(() => useRoundDetail(c, round.id, go));
  await waitFor(() => expect(first.result.current.round).not.toBeNull());
  await act(() => { first.result.current.edit(1); });
  await waitFor(() => expect(first.result.current.pending).toBe(false));
  const draft = { ...hole(1, 5), strokes: 7 };
  await act(async () => { await first.result.current.saveDraft(draft); });
  expect(first.result.current.totals?.strokes).toBe(36);
  first.unmount();
  const second = renderHook(() => useRoundDetail(c, round.id, go));
  await waitFor(() => expect(second.result.current.editing).toBe(1));
  expect(second.result.current.round?.drafts[1]).toEqual(draft);
  await act(async () => { await second.result.current.saveHole(draft); });
  expect(second.result.current.editing).toBeNull();
  expect(second.result.current.totals).toMatchObject({ par: 37, strokes: 39, scoreToPar: 2 });
  expect((await c.repository.listFinished())[0]?.holes[0]).toEqual(draft);
  expect(await c.parMemory.lastPar(1)).toBe(5);
});

test('rapid edits serialize and invalid draft remains recoverable until explicit cancel', async () => {
  const round = await finished();
  const { result } = renderHook(() => useRoundDetail(c, round.id, go));
  await waitFor(() => expect(result.current.round).not.toBeNull());
  await act(() => { result.current.edit(1); });
  await waitFor(() => expect(result.current.pending).toBe(false));
  await act(async () => {
    await Promise.all([result.current.saveDraft({ ...hole(1), strokes: 8 }), result.current.saveDraft({ ...hole(1), strokes: 1, putts: 2 })]);
  });
  expect(result.current.round?.drafts[1]).toMatchObject({ strokes: 1, putts: 2 });
  expect(result.current.totals?.strokes).toBe(36);
  await act(async () => { await result.current.cancel(); });
  expect(result.current.round?.drafts).toEqual({});
});

test('unknown id is truthful and retry repeats its failed read', async () => {
  const { result } = renderHook(() => useRoundDetail(c, 'missing', go));
  await waitFor(() => expect(result.current.error?.kind).toBe('not-found'));
  expect(result.current.round).toBeNull();
  await act(async () => { await expect(result.current.controller.retry()).rejects.toMatchObject({ kind: 'not-found' }); });
  expect(result.current.error?.kind).toBe('not-found');
});

test('same-tab removal flushes drafts, unregisters its own writer and preserves every field in undo', async () => {
  const round = await finished();
  const { result } = renderHook(() => useRoundDetail(c, round.id, go));
  await waitFor(() => expect(result.current.round).not.toBeNull());
  await act(async () => { await result.current.saveDraft({ ...hole(3), strokes: 1 }); });
  const durable = result.current.round;
  await act(async () => { await result.current.remove(); });
  expect(paths).toEqual(['/log']);
  expect(result.current.removed).toBe(true);
  expect(result.current.snapshot.error).toBeNull();
  expect(c.undo.getSnapshot().item?.round).toEqual(durable);
  await expect(c.flush()).resolves.toBeUndefined();
  await act(async () => { await result.current.restore(); });
  await waitFor(() => expect(result.current.removed).toBe(false));
  await waitFor(() => expect(result.current.editing).toBe(3));
  expect(result.current.round?.holes).toEqual(durable?.holes);
  expect(result.current.round?.drafts).toEqual(durable?.drafts);
});

test('navigation failure after committed removal retains readable context and persistent undo', async () => {
  const round = await finished();
  let fail = true;
  const navigation = async (path: string): Promise<void> => {
    if (fail) throw new StorageError('io', 'Another open editor needs saving.');
    await go(path);
  };
  const { result } = renderHook(() => useRoundDetail(c, round.id, navigation));
  await waitFor(() => expect(result.current.round).not.toBeNull());
  await act(async () => { await expect(result.current.remove()).rejects.toMatchObject({ kind: 'io' }); });
  expect(result.current.removed).toBe(true);
  expect(result.current.round?.id).toBe(round.id);
  expect(result.current.error?.message).toContain('Another open editor');
  expect(c.undo.getSnapshot().item?.round.id).toBe(round.id);
  fail = false;
  await act(async () => { await result.current.openLog(); });
  expect(paths).toEqual(['/log']);
});

test('global undo recovers a removed detail that stayed mounted after navigation failure', async () => {
  const round = await finished();
  const stay = async (): Promise<void> => { throw new StorageError('io', 'Another editor needs saving.'); };
  const { result } = renderHook(() => useRoundDetail(c, round.id, stay));
  await waitFor(() => expect(result.current.round).not.toBeNull());
  await act(async () => { await result.current.saveDraft({ ...hole(1), strokes: 5 }); });
  const disposed = result.current.controller;
  await act(async () => { await expect(result.current.remove()).rejects.toMatchObject({ kind: 'io' }); });
  await act(async () => { await c.undo.undo(); });
  await waitFor(() => expect(result.current.removed).toBe(false));
  await waitFor(() => expect(result.current.editing).toBe(1));
  expect(result.current.controller).not.toBe(disposed);
  expect(result.current.error).toBeNull();
  await act(async () => { await result.current.saveHole({ ...hole(1), strokes: 5 }); });
  expect(result.current.totals?.strokes).toBe(37);
});

test('closed real database retains failed draft and readable scores; reopening recovers last durable draft', async () => {
  const round = await finished();
  const { result } = renderHook(() => useRoundDetail(c, round.id, go));
  await waitFor(() => expect(result.current.round).not.toBeNull());
  await act(async () => { await result.current.saveDraft({ ...hole(1), strokes: 5 }); });
  storage.close();
  await act(async () => { await expect(result.current.saveDraft({ ...hole(1), strokes: 8 })).rejects.toMatchObject({ kind: 'io' }); });
  expect(result.current.snapshot.localDrafts[1]?.strokes).toBe(8);
  expect(result.current.round?.drafts[1]?.strokes).toBe(5);
  expect(result.current.totals?.strokes).toBe(36);
  const fresh = await reopen();
  expect((await fresh.repository.getRound(round.id)).drafts[1]?.strokes).toBe(5);
});

test('successful retry over a reconnected database clears action errors and closes a confirmed correction', async () => {
  c.close();
  let backing = await createStorage(fixture.name);
  c = await buildContainer({ dbName: fixture.name, logger: createLogger({ level: 'fatal' }),
    storageFactory: async () => ({ ...backing, close: () => backing.close(), repository: { ...backing.repository,
      getRound: async (id) => await backing.repository.getRound(id),
      saveDraft: async (...args) => await backing.repository.saveDraft(...args),
      updateHole: async (...args) => await backing.repository.updateHole(...args),
    } }) });
  const round = await finished();
  const { result } = renderHook(() => useRoundDetail(c, round.id, go));
  await waitFor(() => expect(result.current.round).not.toBeNull());
  await act(() => { result.current.edit(1); });
  await waitFor(() => expect(result.current.pending).toBe(false));
  backing.close();
  await act(async () => { await expect(result.current.saveHole({ ...hole(1), strokes: 5 })).rejects.toMatchObject({ kind: 'io' }); });
  expect(result.current.editing).toBe(1);
  backing = await createStorage(fixture.name);
  await act(async () => { await result.current.controller.retry(); await result.current.recovered(); });
  expect(result.current.error).toBeNull();
  expect(result.current.editing).toBeNull();
  expect(result.current.totals?.strokes).toBe(37);
});

test('failed native removal retains screen and round; a fresh connection can retry', async () => {
  const round = await finished();
  const { result } = renderHook(() => useRoundDetail(c, round.id, go));
  await waitFor(() => expect(result.current.round).not.toBeNull());
  storage.close();
  await act(async () => { await expect(result.current.remove()).rejects.toMatchObject({ kind: 'io' }); });
  expect(result.current.removed).toBe(false);
  expect(result.current.round).toEqual(round);
  expect(c.undo.getSnapshot().item).toBeNull();
  expect(paths).toEqual([]);
  const fresh = await reopen();
  await fresh.undo.remove(round.id, round.revision);
  expect(fresh.undo.getSnapshot().item?.round.id).toBe(round.id);
});

test.each(['restore', 'dismiss'] as const)('failed native %s retains persistent token for retry after restart', async (operation) => {
  const round = await finished();
  const { result } = renderHook(() => useRoundDetail(c, round.id, go));
  await waitFor(() => expect(result.current.round).not.toBeNull());
  await act(async () => { await result.current.remove(); });
  const item = c.undo.getSnapshot().item;
  storage.close();
  await act(async () => {
    await expect(operation === 'restore' ? result.current.restore() : c.undo.dismiss()).rejects.toMatchObject({ kind: 'io' });
  });
  expect(c.undo.getSnapshot().item).toEqual(item);
  expect(c.undo.getSnapshot().error?.kind).toBe('io');
  const fresh = await reopen();
  expect(fresh.undo.getSnapshot().item).toEqual(item);
  if (operation === 'restore') {
    await fresh.undo.undo(); expect((await fresh.repository.getRound(round.id)).holes).toEqual(round.holes);
  } else {
    await fresh.undo.dismiss(); await expect(fresh.repository.getRound(round.id)).rejects.toMatchObject({ kind: 'not-found' });
  }
  expect(fresh.undo.getSnapshot().item).toBeNull();
});

test('another tab correction surfaces both versions and reapply never confirms automatically', async () => {
  const round = await finished();
  const { result } = renderHook(() => useRoundDetail(c, round.id, go));
  await waitFor(() => expect(result.current.round).not.toBeNull());
  await act(async () => { await result.current.saveDraft({ ...hole(1), strokes: 5 }); });
  const other = await reopen();
  const latest = await other.repository.getRound(round.id);
  await other.repository.updateHole(round.id, { ...hole(1), strokes: 7 }, latest.revision);
  await act(async () => { await c.refresh(); });
  expect(result.current.error?.kind).toBe('conflict');
  expect(result.current.snapshot.localDrafts[1]?.strokes).toBe(5);
  expect(result.current.snapshot.conflictRound?.holes[0]?.strokes).toBe(7);
  await act(async () => { await result.current.controller.resolveConflict('reapply'); });
  expect(result.current.round?.holes[0]?.strokes).toBe(7);
  expect(result.current.round?.drafts[1]?.strokes).toBe(5);
  await act(async () => { await result.current.saveHole({ ...hole(1), strokes: 5 }); });
  expect(result.current.round?.holes[0]?.strokes).toBe(5);
});

test('racing removals create only one pending token and losing detail remains intact', async () => {
  const first = await finished(); const second = await finished();
  const other = await reopen();
  const a = renderHook(() => useRoundDetail(c, first.id, go));
  const b = renderHook(() => useRoundDetail(other, second.id, go));
  await waitFor(() => expect(a.result.current.round).not.toBeNull());
  await waitFor(() => expect(b.result.current.round).not.toBeNull());
  let outcomes: PromiseSettledResult<void>[] = [];
  await act(async () => { outcomes = await Promise.allSettled([a.result.current.remove(), b.result.current.remove()]); });
  expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
  const loser = a.result.current.removed ? b.result.current : a.result.current;
  expect(loser.error?.kind).toBe('conflict');
  expect(loser.removed).toBe(false);
  expect((await c.repository.listFinished())).toHaveLength(1);
  expect(await c.trash.getPendingRemoval()).toBeDefined();
});

function renderApp(path: string): void {
  window.history.replaceState(null, '', `#${path}`);
  render(h(App, { container: c, persistence: 'Stored on this device.',
    theme: createThemeController({ read: () => null, write: () => undefined, apply: () => undefined, logger: c.logger }),
    offline: { ready: false, error: null, updateAvailable: false, updating: false },
    updates: { async checkForUpdate(): Promise<void> {}, async applyUpdate(): Promise<void> {}, dispose(): void {} } }));
}

test('native failed removal renders a retry beside the intact scorecard', async () => {
  const round = await finished(); renderApp(`/log/${round.id}`);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Remove round', exact: true })).toBeTruthy());
  storage.close();
  fireEvent.click(screen.getByRole('button', { name: 'Remove round', exact: true }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry removing round' })).toBeTruthy());
  expect(screen.getByRole('table', { name: 'Scorecard' })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Pending round removal' })).toBeNull();
  expect(screen.getAllByRole('status').some((node) => node.textContent?.includes('storage'))).toBe(true);
});

test.each(['Undo', 'Dismiss'])('native failed %s is visible inside the persistent global undo region', async (button) => {
  const round = await finished(); await c.undo.remove(round.id, round.revision); renderApp('/log');
  await waitFor(() => expect(screen.getByRole('region', { name: 'Pending round removal' })).toBeTruthy());
  storage.close();
  fireEvent.click(screen.getByRole('button', { name: button, exact: true }));
  await waitFor(() => expect(c.undo.getSnapshot().error?.kind).toBe('io'));
  const region = screen.getByRole('region', { name: 'Pending round removal' });
  expect(region.querySelector('[data-tone="error"]')?.textContent).toContain(c.undo.getSnapshot().error?.message);
  await waitFor(() => expect((screen.getByRole('button', { name: button, exact: true }) as HTMLButtonElement).disabled).toBe(false));
  expect(c.undo.getSnapshot().item?.round).toEqual(round);
});
