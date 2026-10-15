import { act, cleanup, renderHook, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { buildContainer } from '../../app/container';
import type { Container } from '../../app/container';
import { createLogger } from '../../app/logger';
import { databaseFixture, hole, play } from '../../storage/__tests__/support';
import { useRoundList } from './useRoundList';
import { roundDate } from './presentation';

let fixture: ReturnType<typeof databaseFixture>;
let c: Container;
beforeEach(async () => {
  fixture = databaseFixture();
  c = await buildContainer({ dbName: fixture.name, logger: createLogger({ level: 'fatal' }) });
});
afterEach(async () => { cleanup(); c.close(); await fixture.cleanup(); });

test('history returns confirmed totals and deterministic dates with active round separate', async () => {
  let older = await play(c.repository, 18, '2026-10-10');
  older = await c.repository.finishRound(older.id, older.revision);
  let newer = await play(c.repository, 9, '2026-10-15');
  newer = await c.repository.finishRound(newer.id, newer.revision);
  await c.repository.saveDraft(newer.id, { ...hole(1), strokes: 9 }, newer.revision);
  const active = await play(c.repository, 2, '2026-10-16');
  const { result } = renderHook(() => useRoundList(c));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.finished.map((item) => item.round.id)).toEqual([newer.id, older.id]);
  expect(result.current.finished.map((item) => item.totals)).toMatchObject([
    { holesPlayed: 9, strokes: 36, putts: 18, scoreToPar: 0, girPct: 100, fairwaysHit: 9, fairwaysEligible: 9 },
    { holesPlayed: 18, strokes: 72, putts: 36, scoreToPar: 0, girPct: 100, fairwaysHit: 18, fairwaysEligible: 18 },
  ]);
  expect(result.current.inProgress?.round).toEqual(active);
});

test('focus and committed controller mutations update the list without remounting', async () => {
  const { result } = renderHook(() => useRoundList(c));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.finished).toEqual([]);
  await act(async () => { await c.session.start(); });
  await waitFor(() => expect(result.current.inProgress?.round.id).toBe(c.session.getSnapshot().round?.id));
  let round = result.current.inProgress?.round;
  if (!round) throw new Error('Expected active round');
  for (let n = 1; n <= 9; n += 1) round = await c.repository.saveHole(round.id, hole(n), round.revision);
  await c.repository.finishRound(round.id, round.revision);
  await act(() => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(result.current.finished).toHaveLength(1));
  expect(result.current.inProgress).toBeNull();
});

test('real connection failure preserves prior visible content and reports a typed error', async () => {
  const round = await play(c.repository, 1);
  const { result } = renderHook(() => useRoundList(c));
  await waitFor(() => expect(result.current.inProgress?.round.id).toBe(round.id));
  c.close();
  await act(async () => { await result.current.reload(); });
  expect(result.current).toMatchObject({ loading: false, error: { kind: 'io' }, inProgress: { round } });
});

test('a late older response cannot replace a newer committed list result', async () => {
  let release: () => void = (): void => undefined;
  let entered: () => void = (): void => undefined;
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  let reads = 0;
  const delayed: Container = { ...c, repository: { ...c.repository, async getInProgress() {
    const actual = await c.repository.getInProgress();
    if (++reads === 1) { entered(); await held; }
    return actual;
  } } };
  const { result } = renderHook(() => useRoundList(delayed));
  await ready;
  await c.session.start();
  await waitFor(() => expect(result.current.inProgress).not.toBeNull());
  const committed = result.current.inProgress;
  await act(async () => { release(); await held; });
  expect(result.current.inProgress).toEqual(committed);
});

test('displayed calendar date keeps the requested day and year', () => {
  const expected = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(2026, 9, 15, 12));
  expect(roundDate('2026-10-15')).toBe(expected);
});
