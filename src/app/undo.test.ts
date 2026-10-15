import { afterEach, beforeEach, expect, test } from 'vitest';
import { createRoundTrash } from '../storage';
import { databaseFixture, hole, play, repository } from '../storage/__tests__/support';
import { createUndoController } from './undo';
import type { UndoController, UndoOptions } from './undo';
import type { Logger } from './logger';

let fixture: ReturnType<typeof databaseFixture>;
let controllers: UndoController[];
let logger: Pick<Logger, 'info' | 'error'>;
let events: object[];
beforeEach(() => {
  fixture = databaseFixture(); controllers = []; events = [];
  logger = { info: (value: unknown): void => { if (typeof value === 'object' && value !== null) events.push(value); },
    error: (value: unknown): void => { if (typeof value === 'object' && value !== null) events.push(value); } };
});
afterEach(async () => { for (const controller of controllers) controller.dispose(); await fixture.cleanup(); });

function controller(options: Omit<UndoOptions, 'logger'>): UndoController {
  const result = createUndoController({ ...options, logger });
  controllers.push(result);
  return result;
}

test('startup recovers durable removal, disposal preserves it, and duplicate undo shares one commit', async () => {
  const db = await fixture.open();
  const repo = repository(db);
  const trash = createRoundTrash(db, () => 'token');
  let round = await play(repo, 1);
  round = await repo.saveDraft(round.id, { ...hole(2), putts: 8, fairway: null }, round.revision);
  const first = controller({ repository: repo, trash });
  const removing = first.remove(round.id, round.revision);
  expect(first.remove(round.id, round.revision)).toBe(removing);
  await removing;
  first.dispose();
  db.close();
  const reopened = await fixture.open();
  const resumed = controller({ repository: repository(reopened), trash: createRoundTrash(reopened, () => 'other') });
  await resumed.load();
  expect(resumed.getSnapshot().item?.round).toEqual(round);
  const undoing = resumed.undo();
  expect(resumed.undo()).toBe(undoing);
  expect(resumed.getSnapshot().pending).toBe(true);
  expect(await undoing).toEqual({ ...round, revision: round.revision + 1 });
  expect(resumed.getSnapshot()).toEqual({ item: null, error: null, pending: false });
  expect(events).toEqual([{ event: 'round.removed', roundId: round.id }, { event: 'round.restored', roundId: round.id }]);
});

test('simultaneous undo in two real connections returns the restored round to both controllers', async () => {
  const db1 = await fixture.open();
  const db2 = await fixture.open();
  const repo1 = repository(db1);
  const round = await play(repo1, 1);
  const first = controller({ repository: repo1, trash: createRoundTrash(db1, () => 'token') });
  const second = controller({ repository: repository(db2), trash: createRoundTrash(db2, () => 'other') });
  await first.remove(round.id, round.revision);
  await second.load();
  const results = await Promise.all([first.undo(), second.undo()]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0]?.revision).toBe(round.revision + 1);
  expect(first.getSnapshot().item).toBeNull();
  expect(second.getSnapshot().item).toBeNull();
});

test('stale dismiss rereads the current token and never purges a newer removal', async () => {
  const db1 = await fixture.open();
  const db2 = await fixture.open();
  const repo = repository(db1);
  const trash1 = createRoundTrash(db1, () => 'first-token');
  const trash2 = createRoundTrash(db2, () => 'new-token');
  const first = controller({ repository: repo, trash: trash1 });
  const second = controller({ repository: repository(db2), trash: trash2 });
  const old = await repo.createRound('2026-10-15');
  await first.remove(old.id, old.revision);
  await second.load();
  await second.dismiss();
  const newer = await repo.createRound('2026-10-16');
  await second.remove(newer.id, newer.revision);
  await first.dismiss();
  expect(first.getSnapshot().item).toEqual(second.getSnapshot().item);
  expect((await trash1.getPendingRemoval())?.token).toBe('new-token');
});

test('undo after another tab dismisses clears the stale item and reports not-found without recreation', async () => {
  const db1 = await fixture.open();
  const db2 = await fixture.open();
  const repo = repository(db1);
  const first = controller({ repository: repo, trash: createRoundTrash(db1, () => 'token') });
  const second = controller({ repository: repository(db2), trash: createRoundTrash(db2, () => 'other') });
  const round = await repo.createRound('2026-10-15');
  await first.remove(round.id, round.revision);
  await second.load();
  await second.dismiss();
  await expect(first.undo()).rejects.toMatchObject({ kind: 'not-found' });
  expect(first.getSnapshot().item).toBeNull();
  expect(await repo.getInProgress()).toBeUndefined();
});

test('native restore failure retains the item and a later retry succeeds after reconnect', async () => {
  const db = await fixture.open();
  let repo = repository(db);
  let trash = createRoundTrash(db, () => 'token');
  const bridge = { getPendingRemoval: () => trash.getPendingRemoval(),
    removeRound: (id: string, revision: number) => trash.removeRound(id, revision),
    restoreRound: (token: string) => trash.restoreRound(token), purgeTrash: (token: string) => trash.purgeTrash(token) };
  const undo = controller({ repository: { getRound: (id) => repo.getRound(id) }, trash: bridge });
  const round = await play(repo, 1);
  await undo.remove(round.id, round.revision);
  const item = undo.getSnapshot().item;
  db.close();
  await expect(undo.undo()).rejects.toMatchObject({ kind: 'io' });
  expect(undo.getSnapshot()).toMatchObject({ item, pending: false, error: { kind: 'io' } });
  const reopened = await fixture.open();
  repo = repository(reopened);
  trash = createRoundTrash(reopened, () => 'later');
  expect((await undo.undo()).id).toBe(round.id);
  expect(undo.getSnapshot()).toEqual({ item: null, pending: false, error: null });
});

test('a failed dismissal retains undo, and explicit retry is the only purge', async () => {
  const db = await fixture.open();
  const repo = repository(db);
  let trash = createRoundTrash(db, () => 'token');
  const undo = controller({ repository: repo, trash: { ...trash,
    purgeTrash: (token) => trash.purgeTrash(token), getPendingRemoval: () => trash.getPendingRemoval() } });
  const round = await repo.createRound('2026-10-15');
  await undo.remove(round.id, round.revision);
  db.close();
  await expect(undo.dismiss()).rejects.toMatchObject({ kind: 'io' });
  expect(undo.getSnapshot().item?.round.id).toBe(round.id);
  trash = createRoundTrash(await fixture.open(), () => 'other');
  expect(await trash.getPendingRemoval()).toBeDefined();
  await undo.dismiss();
  expect(await trash.getPendingRemoval()).toBeUndefined();
});

test('update admission lock and stale revisions never remove a round', async () => {
  const db = await fixture.open();
  const repo = repository(db);
  let locked = true;
  const undo = controller({ repository: repo, trash: createRoundTrash(db, () => 'token'), canMutate: () => !locked });
  const round = await play(repo, 1);
  await expect(undo.remove(round.id, round.revision)).rejects.toMatchObject({ kind: 'blocked' });
  locked = false;
  await expect(undo.remove(round.id, 0)).rejects.toMatchObject({ kind: 'conflict' });
  expect(await repo.getRound(round.id)).toEqual(round);
  await undo.remove(round.id, round.revision);
  expect(undo.getSnapshot().item?.round).toEqual(round);
});

test('observers unsubscribe and neither controller disposal nor an empty dismiss clears stored undo', async () => {
  const db = await fixture.open();
  const repo = repository(db);
  const trash = createRoundTrash(db, () => 'token');
  const round = await repo.createRound('2026-10-15');
  await trash.removeRound(round.id, round.revision);
  const undo = controller({ repository: repo, trash });
  let notifications = 0;
  const unsubscribe = undo.subscribe(() => { notifications += 1; });
  await undo.dismiss();
  expect(undo.getSnapshot().item?.round.id).toBe(round.id);
  unsubscribe();
  const previous = notifications;
  await undo.load();
  expect(notifications).toBe(previous);
  undo.dispose();
  expect((await trash.getPendingRemoval())?.round.id).toBe(round.id);
  await expect(undo.dismiss()).rejects.toMatchObject({ kind: 'io' });
});
