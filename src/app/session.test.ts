import { afterEach, beforeEach, expect, test } from 'vitest';
import { roundTotals } from '../domain';
import type { HoleDraft } from '../domain';
import { createRoundTrash } from '../storage';
import type { RoundRepository } from '../storage';
import { databaseFixture, hole, play, repository } from '../storage/__tests__/support';
import { createSessionController } from './session';
import type { SessionController } from './session';
import type { Logger } from './logger';

let fixture: ReturnType<typeof databaseFixture>;
let sessions: SessionController[];
let events: object[];
let logger: Pick<Logger, 'info' | 'error'>;
beforeEach(() => {
  fixture = databaseFixture(); sessions = []; events = [];
  logger = { info: (value: unknown): void => { if (typeof value === 'object' && value !== null) events.push(value); },
    error: (value: unknown): void => { if (typeof value === 'object' && value !== null) events.push(value); } };
});
afterEach(async () => { for (const session of sessions) session.dispose(); await fixture.cleanup(); });

function session(repo: RoundRepository, options: Partial<Parameters<typeof createSessionController>[0]> = {}): SessionController {
  const result = createSessionController({ repository: repo, today: () => '2026-10-15', logger, ...options });
  sessions.push(result);
  return result;
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let release: () => void = (): void => undefined;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, resolve: release };
}

test('start and confirm guard duplicate commands and report only committed lifecycle metadata', async () => {
  const repo = repository(await fixture.open());
  let commits = 0;
  const controller = session(repo, { onCommit: () => { commits += 1; } });
  const first = controller.start();
  expect(controller.start()).toBe(first);
  expect(controller.getSnapshot().pending).toBe(true);
  await first;
  expect(controller.getSnapshot()).toMatchObject({ pending: false, saveState: 'saved', round: { date: '2026-10-15' } });
  const save = controller.save(hole(1));
  expect(controller.save(hole(1))).toBe(save);
  await save;
  expect(controller.getSnapshot().round?.holes).toEqual([hole(1)]);
  expect(commits).toBe(2);
  expect(events).toEqual([
    { event: 'round.started', roundId: controller.getSnapshot().round?.id, holes: 0 },
    { event: 'hole.saved', roundId: controller.getSnapshot().round?.id, holes: 1 },
  ]);
});

test('ordered rapid drafts retain newer input until its own native commit and keep confirmed totals', async () => {
  const repo = repository(await fixture.open());
  const round = await play(repo, 1);
  const entered = deferred();
  const release = deferred();
  let writes = 0;
  const controller = session({ ...repo, async saveDraft(...args) {
    writes += 1;
    if (writes === 1) { entered.resolve(); await release.promise; }
    return repo.saveDraft(...args);
  } });
  await controller.load();
  const version = controller.getSnapshot().editorVersion;
  const earlier = { ...hole(2), fairway: null };
  const latest = { ...earlier, putts: 8 };
  const first = controller.saveDraft(earlier);
  await entered.promise;
  const second = controller.saveDraft(latest);
  expect(controller.getSnapshot().localDrafts[2]).toEqual(latest);
  expect(controller.getSnapshot().saveState).toBe('saving');
  release.resolve();
  await Promise.all([first, second]);
  expect(controller.getSnapshot()).toMatchObject({ localDrafts: {}, saveState: 'saved', editorVersion: version });
  expect(controller.getSnapshot().round?.drafts[2]).toEqual(latest);
  expect(roundTotals(controller.getSnapshot().round?.holes ?? [])).toEqual(roundTotals(round.holes));
  expect(writes).toBe(2);
});

test('confirm waits for prior draft commits and never silently confirms input changed while queued', async () => {
  const repo = repository(await fixture.open());
  const entered = deferred();
  const release = deferred();
  let writes = 0;
  const controller = session({ ...repo, async saveDraft(...args) {
    if (++writes === 1) { entered.resolve(); await release.promise; }
    return repo.saveDraft(...args);
  } });
  await controller.start();
  const drafting = controller.saveDraft(hole(1));
  await entered.promise;
  const confirming = controller.save(hole(1));
  const latest = { ...hole(1), strokes: 5 };
  const editing = controller.saveDraft(latest);
  release.resolve();
  await drafting;
  await expect(confirming).rejects.toMatchObject({ kind: 'invalid' });
  await editing;
  expect(controller.getSnapshot().round?.holes).toHaveLength(0);
  expect(controller.getSnapshot().round?.drafts[1]).toEqual(latest);
  await controller.save(latest);
  expect(controller.getSnapshot().round?.holes).toEqual([latest]);
});

test('native connection failures retain latest drafts, block navigation and retry after reconnect', async () => {
  const db = await fixture.open();
  let repo = repository(db);
  const controller = session({ ...repo, getInProgress: () => repo.getInProgress(),
    getRound: (...args) => repo.getRound(...args), saveDraft: (...args) => repo.saveDraft(...args) });
  await controller.start();
  db.close();
  const first = { ...hole(1), fairway: null };
  const latest = { ...first, putts: 5 };
  await expect(controller.saveDraft(first)).rejects.toMatchObject({ kind: 'io' });
  await expect(controller.saveDraft(latest)).rejects.toMatchObject({ kind: 'io' });
  await expect(controller.refresh()).rejects.toMatchObject({ kind: 'io' });
  await expect(controller.flush()).rejects.toMatchObject({ kind: 'io' });
  await expect(controller.load()).rejects.toMatchObject({ kind: 'io' });
  expect(controller.getSnapshot()).toMatchObject({ localDrafts: { 1: latest }, saveState: 'error', pending: false });
  repo = repository(await fixture.open());
  await controller.retry();
  expect(controller.getSnapshot()).toMatchObject({ localDrafts: {}, saveState: 'saved', error: null });
  expect(controller.getSnapshot().round?.drafts[1]).toEqual(latest);
});

test('retry persists newer input without replaying an obsolete failed confirmation', async () => {
  const db = await fixture.open();
  let repo = repository(db);
  const controller = session({ ...repo, getRound: (...args) => repo.getRound(...args),
    saveDraft: (...args) => repo.saveDraft(...args), saveHole: (...args) => repo.saveHole(...args) });
  await controller.start();
  db.close();
  await expect(controller.save(hole(1))).rejects.toMatchObject({ kind: 'io' });
  const newer = { ...hole(1), strokes: 6 };
  await expect(controller.saveDraft(newer)).rejects.toMatchObject({ kind: 'io' });
  repo = repository(await fixture.open());
  await controller.retry();
  expect(controller.getSnapshot().round?.holes).toEqual([]);
  expect(controller.getSnapshot().round?.drafts[1]).toEqual(newer);
  await controller.save(newer);
  expect(controller.getSnapshot().round?.holes).toEqual([newer]);
});

test('a failed confirmation with unchanged values retries durably after reconnect', async () => {
  const db = await fixture.open();
  let repo = repository(db);
  const controller = session({ ...repo, getRound: (...args) => repo.getRound(...args),
    saveDraft: (...args) => repo.saveDraft(...args), saveHole: (...args) => repo.saveHole(...args) });
  await controller.start();
  db.close();
  await expect(controller.save(hole(1))).rejects.toMatchObject({ kind: 'io' });
  repo = repository(await fixture.open());
  await controller.retry();
  expect(controller.getSnapshot().round?.holes).toEqual([hole(1)]);
  expect(controller.getSnapshot().localDrafts).toEqual({});
});

test('conflicting tabs retain local values and explicit reapply writes drafts without confirming scores', async () => {
  const repo = repository(await fixture.open());
  const other = repository(await fixture.open());
  const controller = session(repo);
  await controller.start();
  const initial = controller.getSnapshot().round;
  if (!initial) throw new Error('Expected started round');
  const external = await other.saveDraft(initial.id, { ...hole(1), strokes: 7 }, initial.revision);
  const local = { ...hole(1), strokes: 5 };
  await expect(controller.saveDraft(local)).rejects.toMatchObject({ kind: 'conflict' });
  expect(controller.getSnapshot()).toMatchObject({ localDrafts: { 1: local }, conflictRound: external });
  await expect(controller.retry()).rejects.toMatchObject({ kind: 'conflict' });
  expect(await other.getRound(initial.id)).toEqual(external);
  await controller.resolveConflict('reapply');
  expect(controller.getSnapshot()).toMatchObject({ error: null, conflictRound: null, localDrafts: {} });
  expect(controller.getSnapshot().round?.holes).toEqual([]);
  expect((await other.getRound(initial.id)).drafts[1]).toEqual(local);
});

test('focus refresh preserves older durable corrections when another tab commits changes', async () => {
  const repo = repository(await fixture.open());
  const other = repository(await fixture.open());
  const controller = session(repo);
  const round = await play(repo, 1);
  await controller.load();
  const local = { ...hole(1), putts: 6 };
  await controller.saveDraft(local);
  const before = controller.getSnapshot().round;
  if (!before) throw new Error('Missing round');
  const external = await other.updateHole(round.id, hole(1, 3), before.revision);
  await expect(controller.refresh()).rejects.toMatchObject({ kind: 'conflict' });
  expect(controller.getSnapshot()).toMatchObject({ round: before, localDrafts: { 1: local }, conflictRound: external });
  const version = controller.getSnapshot().editorVersion;
  await controller.resolveConflict('reload');
  expect(controller.getSnapshot()).toMatchObject({ round: external, localDrafts: {}, error: null, editorVersion: version + 1 });
});

test('clean refresh accepts external changes and missing-round reapply never recreates data', async () => {
  const db = await fixture.open();
  const repo = repository(db);
  const other = repository(await fixture.open());
  const controller = session(repo);
  await controller.start();
  const first = controller.getSnapshot().round;
  if (!first) throw new Error('Missing round');
  const external = await other.saveHole(first.id, hole(1), first.revision);
  await controller.refresh();
  expect(controller.getSnapshot().round).toEqual(external);
  await createRoundTrash(db, () => 'removed').removeRound(external.id, external.revision);
  await expect(controller.saveDraft(hole(2))).rejects.toMatchObject({ kind: 'conflict' });
  expect(controller.getSnapshot().conflictRound).toBeNull();
  await expect(controller.resolveConflict('reapply')).rejects.toMatchObject({ kind: 'not-found' });
  expect(await repo.getInProgress()).toBeUndefined();
  await controller.resolveConflict('reload');
  expect(controller.getSnapshot()).toMatchObject({ round: null, localDrafts: {}, error: null });
});

test('invalid finish can be fixed by explicit discard and finished corrections keep their lifecycle', async () => {
  const repo = repository(await fixture.open());
  const round = await play(repo, 9);
  const controller = session(repo);
  await controller.load(round.id);
  await controller.saveDraft({ ...hole(1), putts: 8 });
  await expect(controller.finish()).rejects.toMatchObject({ kind: 'invalid' });
  await controller.flush();
  expect(controller.getSnapshot().error?.kind).toBe('invalid');
  await controller.discardDraft(1);
  await controller.finish();
  expect(controller.getSnapshot().round?.status).toBe('finished');
  await controller.correct(hole(1, 3));
  expect(controller.getSnapshot().round).toMatchObject({ status: 'finished', holes: [hole(1, 3), ...round.holes.slice(1)] });
});

test('validation-only finish error permits navigation to correction and explicit reload after own abandonment', async () => {
  const db = await fixture.open();
  const repo = repository(db);
  await play(repo, 9);
  const controller = session(repo);
  await controller.load();
  await controller.saveDraft({ ...hole(1), putts: 7 });
  await expect(controller.finish()).rejects.toMatchObject({ kind: 'invalid' });
  await controller.flush();
  await controller.correct(hole(1, 3));
  expect(controller.getSnapshot().error).toBeNull();
  await controller.saveDraft({ ...hole(2), fairway: null });
  await expect(controller.finish()).rejects.toMatchObject({ kind: 'invalid' });
  const current = controller.getSnapshot().round;
  if (!current) throw new Error('Expected current round');
  await createRoundTrash(db, () => 'abandoned').removeRound(current.id, current.revision);
  await controller.load();
  expect(controller.getSnapshot()).toMatchObject({ round: null, error: null, localDrafts: {} });
});

test('retry repeats the explicit failed load target, retaining unknown-id errors truthfully', async () => {
  const db = await fixture.open();
  let repo = repository(db);
  const round = await play(repo, 1);
  const controller = session({ ...repo, getRound: (...args) => repo.getRound(...args) });
  db.close();
  await expect(controller.load(round.id)).rejects.toMatchObject({ kind: 'io' });
  repo = repository(await fixture.open());
  await controller.retry();
  expect(controller.getSnapshot()).toMatchObject({ round, error: null });
  await expect(controller.load('missing')).rejects.toMatchObject({ kind: 'not-found' });
  await expect(controller.retry()).rejects.toMatchObject({ kind: 'not-found' });
  expect(controller.getSnapshot().round).toEqual(round);
  await expect(controller.flush()).resolves.toBeUndefined();
  expect(controller.getSnapshot().error?.kind).toBe('not-found');
});

test('retry repeats failed refresh reads and updates the durable snapshot after reconnect', async () => {
  const db = await fixture.open();
  let repo = repository(db);
  const round = await play(repo, 1);
  const controller = session({ ...repo, getInProgress: () => repo.getInProgress() });
  await controller.load();
  db.close();
  await expect(controller.refresh()).rejects.toMatchObject({ kind: 'io' });
  await expect(controller.flush()).resolves.toBeUndefined();
  repo = repository(await fixture.open());
  const external = await repo.saveHole(round.id, hole(2), round.revision);
  await controller.retry();
  expect(controller.getSnapshot()).toMatchObject({ round: external, error: null });
});

test('turn continuation and final finish await their durable commits', async () => {
  const repo = repository(await fixture.open());
  await play(repo, 9);
  const controller = session(repo);
  await controller.load();
  const continuing = controller.continueRound();
  expect(controller.continueRound()).toBe(continuing);
  expect(controller.getSnapshot().round?.continuedTo18).toBe(false);
  await continuing;
  expect(controller.getSnapshot().round).toMatchObject({ continuedTo18: true, activeHole: 10 });
  for (let number = 10; number <= 18; number += 1) await controller.save(hole(number));
  expect(controller.getSnapshot().round).toMatchObject({ status: 'in-progress', activeHole: null });
  await controller.finish();
  expect(controller.getSnapshot().round?.status).toBe('finished');
});

test('update lock rejects new commands while previously admitted drafts drain normally', async () => {
  const repo = repository(await fixture.open());
  const entered = deferred();
  const release = deferred();
  let locked = false;
  const controller = session({ ...repo, async saveDraft(...args) {
    entered.resolve(); await release.promise; return repo.saveDraft(...args);
  } }, { canMutate: () => !locked });
  await controller.start();
  const accepted = controller.saveDraft(hole(1));
  await entered.promise;
  locked = true;
  await expect(controller.saveDraft({ ...hole(1), strokes: 8 })).rejects.toMatchObject({ kind: 'blocked' });
  release.resolve();
  await accepted;
  await controller.flush();
  expect(controller.getSnapshot()).toMatchObject({ saveState: 'saved', error: null, localDrafts: {} });
  expect(controller.getSnapshot().round?.drafts[1]).toEqual(hole(1));
});

test('disposal unregisters once, observer failures do not turn commits into failed writes, and drafts survive', async () => {
  const repo = repository(await fixture.open());
  let disposals = 0;
  let notifications = 0;
  const controller = session(repo, { onDispose: () => { disposals += 1; } });
  controller.subscribe(() => { notifications += 1; });
  controller.subscribe(() => { throw new Error('broken view observer'); });
  await controller.start();
  const draft: HoleDraft = { ...hole(1), fairway: null };
  await controller.saveDraft(draft);
  controller.dispose(); controller.dispose();
  const previous = notifications;
  await expect(controller.saveDraft(hole(1))).rejects.toMatchObject({ kind: 'io' });
  expect(notifications).toBe(previous);
  expect(disposals).toBe(1);
  expect((await repo.getInProgress())?.drafts[1]).toEqual(draft);
});

test('a rejected temporary admission does not latch navigation or the next command after unlock', async () => {
  const repo = repository(await fixture.open());
  let locked = true;
  const controller = session(repo, { canMutate: () => !locked });
  await expect(controller.start()).rejects.toMatchObject({ kind: 'blocked' });
  locked = false;
  await controller.flush();
  await controller.start();
  expect(controller.getSnapshot()).toMatchObject({ error: null, saveState: 'saved', pending: false });
});

test('load queues behind an admitted draft and a discarded unsaved draft never changes confirmed score', async () => {
  const repo = repository(await fixture.open());
  const controller = session(repo);
  await controller.start();
  await controller.save(hole(1));
  const editing = controller.saveDraft({ ...hole(1), putts: 7 });
  const loading = controller.load();
  await Promise.all([editing, loading]);
  expect(controller.getSnapshot().round?.drafts[1]?.putts).toBe(7);
  await controller.discardDraft(1);
  expect(controller.getSnapshot().round?.holes).toEqual([hole(1)]);
  expect(controller.getSnapshot().round?.drafts).toEqual({});
});

test('failed continue and finish retain their durable boundary until explicit retry', async () => {
  let db = await fixture.open();
  let repo = repository(db);
  await play(repo, 9);
  const controller = session({ ...repo, getRound: (...args) => repo.getRound(...args),
    continueRound: (...args) => repo.continueRound(...args), saveHole: (...args) => repo.saveHole(...args),
    finishRound: (...args) => repo.finishRound(...args) });
  await controller.load();
  db.close();
  await expect(controller.continueRound()).rejects.toMatchObject({ kind: 'io' });
  expect(controller.getSnapshot().round?.continuedTo18).toBe(false);
  db = await fixture.open(); repo = repository(db);
  await controller.retry();
  expect(controller.getSnapshot().round?.activeHole).toBe(10);
  for (let number = 10; number <= 18; number += 1) await controller.save(hole(number));
  db.close();
  await expect(controller.finish()).rejects.toMatchObject({ kind: 'io' });
  expect(controller.getSnapshot().round?.status).toBe('in-progress');
  repo = repository(await fixture.open());
  await controller.retry();
  expect(controller.getSnapshot().round?.status).toBe('finished');
});
