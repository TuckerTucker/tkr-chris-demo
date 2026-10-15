import { afterEach, beforeEach, expect, test } from 'vitest';
import { createRoundTrash } from './round-trash';
import { createRoundRepository } from './round-repository';
import { databaseFixture, hole, play, repository } from './__tests__/support';
import type { TrashedRound } from './database';

let fixture: ReturnType<typeof databaseFixture>;
beforeEach(() => { fixture = databaseFixture(); });
afterEach(async () => { await fixture.cleanup(); });

test('remove survives restart, reserves the active slot, restores every draft and increments revision', async () => {
  let db = await fixture.open();
  let repo = repository(db);
  let trash = createRoundTrash(db, () => 'undo-token');
  let round = await play(repo, 2);
  round = await repo.saveDraft(round.id, { ...hole(3), putts: 8, fairway: null }, round.revision);
  const removed = await trash.removeRound(round.id, round.revision);
  expect(await repo.getInProgress()).toBeUndefined();
  await expect(repo.createRound('2026-10-15')).rejects.toMatchObject({ kind: 'conflict' });
  db.close();
  db = await fixture.open();
  repo = repository(db);
  trash = createRoundTrash(db, () => 'different-token');
  expect(await trash.getPendingRemoval()).toEqual(removed);
  const restored = await trash.restoreRound(removed.token);
  expect(restored).toEqual({ ...round, revision: round.revision + 1 });
  expect(await trash.getPendingRemoval()).toBeUndefined();
  expect(await repo.getInProgress()).toEqual(restored);
  await expect(repo.saveHole(round.id, hole(3), round.revision)).rejects.toMatchObject({ kind: 'conflict' });
});

test('one undo token blocks second removal, finished removal permits scoring, wrong dismissal preserves data', async () => {
  const db = await fixture.open();
  const repo = repository(db);
  const trash = createRoundTrash(db, () => crypto.randomUUID());
  let finished = await play(repo, 9);
  finished = await repo.finishRound(finished.id, finished.revision);
  const item = await trash.removeRound(finished.id, finished.revision);
  const active = await repo.createRound('2026-10-16');
  await expect(trash.removeRound(active.id, active.revision)).rejects.toMatchObject({ kind: 'conflict' });
  await expect(trash.purgeTrash('not-this-token')).rejects.toMatchObject({ kind: 'not-found' });
  expect(await trash.getPendingRemoval()).toEqual(item);
  await trash.purgeTrash(item.token);
  expect(await trash.getPendingRemoval()).toBeUndefined();
  expect(await repo.getRound(active.id)).toEqual(active);
  await expect(trash.restoreRound(item.token)).rejects.toMatchObject({ kind: 'not-found' });
  await expect(trash.purgeTrash(item.token)).rejects.toMatchObject({ kind: 'not-found' });
});

test('concurrent removes and undo/dismiss races have one winner and preserve a consistent record', async () => {
  const db1 = await fixture.open();
  const db2 = await fixture.open();
  const repo = repository(db1);
  const first = createRoundTrash(db1, () => 'first-token');
  const second = createRoundTrash(db2, () => 'second-token');
  const round = await play(repo, 1);
  const removals = await Promise.allSettled([
    first.removeRound(round.id, round.revision), second.removeRound(round.id, round.revision),
  ]);
  expect(removals.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(removals.find((result) => result.status === 'rejected')).toMatchObject({ reason: { kind: 'conflict' } });
  const item = await first.getPendingRemoval();
  if (!item) throw new Error('Expected a pending removal');
  const resolutions = await Promise.allSettled([first.restoreRound(item.token), second.purgeTrash(item.token)]);
  expect(resolutions.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(resolutions.find((result) => result.status === 'rejected')).toMatchObject({ reason: { kind: 'not-found' } });
  expect(await first.getPendingRemoval()).toBeUndefined();
  const all = await db1.getAll('rounds');
  expect(all.length).toBe(resolutions[0]?.status === 'fulfilled' ? 1 : 0);
});

test('stale removal and active-slot restore collision retain all durable records', async () => {
  const db = await fixture.open();
  const repo = repository(db);
  const trash = createRoundTrash(db, () => 'undo');
  const round = await play(repo, 1);
  await expect(trash.removeRound(round.id, 0)).rejects.toMatchObject({ kind: 'conflict' });
  expect(await repo.getRound(round.id)).toEqual(round);
  const item = await trash.removeRound(round.id, round.revision);
  // Simulate a legacy/external database writer violating the reserved slot.
  await db.add('rounds', { ...round, id: 'external-round' });
  await expect(trash.restoreRound(item.token)).rejects.toMatchObject({ kind: 'conflict' });
  expect(await trash.getPendingRemoval()).toEqual(item);
  expect(await db.count('rounds')).toBe(1);
});

test('malformed trash is surfaced, never purged, and generated token errors leave round intact', async () => {
  const db = await fixture.open();
  const repo = repository(db);
  const round = await play(repo, 1);
  const trash = createRoundTrash(db, () => '');
  await expect(trash.removeRound(round.id, round.revision)).rejects.toMatchObject({ kind: 'invalid' });
  expect(await repo.getRound(round.id)).toEqual(round);
  await expect(trash.removeRound('missing', 0)).rejects.toMatchObject({ kind: 'not-found' });
  const cases: unknown[] = [
    { id: round.id, token: '', round }, { id: round.id, token: 'undo', round: null },
    { id: 'wrong-id', token: 'undo', round },
  ];
  for (const item of cases) {
    await db.clear('trash');
    await db.put('trash', item as TrashedRound);
    await expect(trash.getPendingRemoval()).rejects.toMatchObject({ kind: 'corrupt' });
    await expect(trash.purgeTrash('undo')).rejects.toMatchObject({ kind: 'corrupt' });
    expect(await db.count('trash')).toBe(1);
  }
});

test('explicit dismissal releases an abandoned active slot and id collisions include finished trash', async () => {
  const db = await fixture.open();
  const repo = createRoundRepository(db, () => 'constant-id');
  const trash = createRoundTrash(db, () => 'undo');
  const round = await repo.createRound('2026-10-15');
  const pending = await trash.removeRound(round.id, round.revision);
  await trash.purgeTrash(pending.token);
  const next = await repo.createRound('2026-10-16');
  expect(next.date).toBe('2026-10-16');
  await db.delete('rounds', next.id);
  let finished = await play(repo, 9);
  finished = await repo.finishRound(finished.id, finished.revision);
  await trash.removeRound(finished.id, finished.revision);
  await expect(repo.createRound('2026-10-17')).rejects.toMatchObject({ kind: 'conflict' });
});

test('closed-connection remove and restore failures retain the pending item for retry', async () => {
  const db = await fixture.open();
  const repo = repository(db);
  const trash = createRoundTrash(db, () => 'undo');
  const round = await play(repo, 1);
  const item = await trash.removeRound(round.id, round.revision);
  db.close();
  await expect(trash.restoreRound(item.token)).rejects.toMatchObject({ kind: 'io' });
  await expect(trash.purgeTrash(item.token)).rejects.toMatchObject({ kind: 'io' });
  const reopened = createRoundTrash(await fixture.open(), () => 'another');
  expect(await reopened.getPendingRemoval()).toEqual(item);
  expect((await reopened.restoreRound(item.token)).id).toBe(round.id);
});
