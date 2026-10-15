import { afterEach, beforeEach, expect, test } from 'vitest';
import { nextStep, roundTotals } from '../domain';
import type { Hole, HoleDraft } from '../domain';
import { createRoundRepository, validateStoredRound } from './round-repository';
import { StorageError } from './errors';
import { databaseFixture, hole, play, repository } from './__tests__/support';
import type { StoredRound } from './database';

let fixture: ReturnType<typeof databaseFixture>;
beforeEach(() => { fixture = databaseFixture(); });
afterEach(async () => { await fixture.cleanup(); });

test('scores and invalid partial drafts recover exactly across a closed connection', async () => {
  const db = await fixture.open();
  let repo = repository(db);
  let round = await play(repo, 1);
  const draft = { ...hole(2), strokes: 1, putts: 4, fairway: null };
  round = await repo.saveDraft(round.id, draft, round.revision);
  const totals = roundTotals(round.holes);
  db.close();
  repo = repository(await fixture.open());
  expect(await repo.getInProgress()).toEqual(round);
  expect((await repo.getRound(round.id)).drafts[2]).toEqual(draft);
  expect(roundTotals((await repo.getRound(round.id)).holes)).toEqual(totals);
  expect(round.activeHole).toBe(2);
});

test('correction preserves another draft, updates par atomically, and discard keeps confirmed score', async () => {
  const db = await fixture.open();
  const repo = repository(db);
  let round = await play(repo, 2);
  const nextDraft = { ...hole(3), fairway: null };
  round = await repo.saveDraft(round.id, nextDraft, round.revision);
  round = await repo.saveDraft(round.id, { ...hole(1), putts: 4 }, round.revision);
  expect(round.activeHole).toBe(1);
  round = await repo.updateHole(round.id, hole(1, 3), round.revision);
  expect(round.drafts).toEqual({ 3: nextDraft });
  expect(round.activeHole).toBe(3);
  expect(await db.get('par-memory', 1)).toEqual({ holeNumber: 1, par: 3 });
  round = await repo.discardDraft(round.id, 3, round.revision);
  expect(round.drafts).toEqual({});
  expect(round.holes[0]).toEqual(hole(1, 3));
  expect(round.activeHole).toBe(3);
});

test('concurrent creation and append commit once, while stale writes preserve the winner', async () => {
  const first = repository(await fixture.open());
  const second = repository(await fixture.open());
  const creations = await Promise.allSettled([first.createRound('2026-10-15'), second.createRound('2026-10-15')]);
  expect(creations.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(creations.find((result) => result.status === 'rejected')).toMatchObject({ reason: { kind: 'conflict' } });
  const round = await first.getInProgress();
  if (!round) throw new Error('Expected the one committed active round');
  const append = await Promise.allSettled([
    first.saveHole(round.id, hole(1), round.revision), second.saveHole(round.id, hole(1, 3), round.revision),
  ]);
  expect(append.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(append.find((result) => result.status === 'rejected')).toMatchObject({ reason: { kind: 'conflict' } });
  expect((await first.getRound(round.id)).holes).toHaveLength(1);
  await expect(second.saveDraft(round.id, { ...hole(1), fairway: null }, round.revision)).rejects.toMatchObject({ kind: 'conflict' });
});

test('concurrent corrections use revisions without lost updates', async () => {
  const first = repository(await fixture.open());
  const second = repository(await fixture.open());
  const round = await play(first, 1);
  const changes = await Promise.allSettled([
    first.updateHole(round.id, hole(1, 3), round.revision), second.updateHole(round.id, hole(1, 5), round.revision),
  ]);
  expect(changes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(changes.find((result) => result.status === 'rejected')).toMatchObject({ reason: { kind: 'conflict' } });
  const current = await first.getRound(round.id);
  expect(current.revision).toBe(round.revision + 1);
  expect([3, 5]).toContain(current.holes[0]?.par);
});

test('turn and finalisation persist before navigation; concurrent decisions commit once', async () => {
  let db = await fixture.open();
  let first = repository(db);
  let round = await play(first, 9);
  expect(nextStep(round)).toBe('turn');
  expect(round.activeHole).toBeNull();
  await expect(first.saveHole(round.id, hole(10), round.revision)).rejects.toMatchObject({ kind: 'invalid' });
  db.close();
  db = await fixture.open();
  first = repository(db);
  expect(nextStep(await first.getRound(round.id))).toBe('turn');
  const second = repository(await fixture.open());
  const choices = await Promise.allSettled([
    first.continueRound(round.id, round.revision), second.continueRound(round.id, round.revision),
  ]);
  expect(choices.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(choices.find((result) => result.status === 'rejected')).toMatchObject({ reason: { kind: 'conflict' } });
  db.close();
  first = repository(await fixture.open());
  round = await first.getRound(round.id);
  expect(round.activeHole).toBe(10);
  await expect(first.continueRound(round.id, round.revision)).rejects.toMatchObject({ kind: 'invalid' });
  await expect(first.finishRound(round.id, round.revision)).rejects.toMatchObject({ kind: 'invalid' });
  for (let number = 10; number <= 18; number += 1) round = await first.saveHole(round.id, hole(number), round.revision);
  expect(nextStep(round)).toBe('finish');
  expect(round.activeHole).toBeNull();
  expect(nextStep(await second.getRound(round.id))).toBe('finish');
  const finishes = await Promise.allSettled([
    first.finishRound(round.id, round.revision), second.finishRound(round.id, round.revision),
  ]);
  expect(finishes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(finishes.find((result) => result.status === 'rejected')).toMatchObject({ reason: { kind: 'conflict' } });
  round = await first.getRound(round.id);
  expect(nextStep(round)).toBe('finished');
  await expect(first.saveHole(round.id, hole(19), round.revision)).rejects.toMatchObject({ kind: 'invalid' });
});

test('nine-hole finish refuses unresolved corrections and finished corrections preserve lifecycle', async () => {
  const repo = repository(await fixture.open());
  let round = await play(repo, 9);
  round = await repo.saveDraft(round.id, { ...hole(1), putts: 5 }, round.revision);
  await expect(repo.finishRound(round.id, round.revision)).rejects.toMatchObject({ kind: 'invalid',
    fieldErrors: [{ code: 'unresolved-drafts' }] });
  round = await repo.discardDraft(round.id, 1, round.revision);
  round = await repo.finishRound(round.id, round.revision);
  round = await repo.saveDraft(round.id, { ...hole(2), fairway: null }, round.revision);
  round = await repo.updateHole(round.id, hole(2, 5), round.revision);
  expect(round).toMatchObject({ status: 'finished', continuedTo18: false, drafts: {}, activeHole: null });
  await expect(repo.saveDraft(round.id, hole(10), round.revision)).rejects.toMatchObject({ kind: 'invalid' });
  await expect(repo.finishRound(round.id, round.revision)).rejects.toMatchObject({ kind: 'invalid' });
});

test('invalid mutations and missing records fail with diagnostics and leave prior data intact', async () => {
  const repo = repository(await fixture.open());
  let round = await repo.createRound('2026-10-15');
  await expect(repo.saveHole(round.id, { ...hole(1), putts: 4 }, round.revision)).rejects.toMatchObject({ kind: 'invalid', fieldErrors: [{ field: 'putts' }] });
  await expect(repo.updateHole(round.id, hole(1), round.revision)).rejects.toMatchObject({ kind: 'invalid' });
  await expect(repo.saveHole(round.id, hole(2), round.revision)).rejects.toMatchObject({ kind: 'invalid' });
  await expect(repo.continueRound(round.id, round.revision)).rejects.toMatchObject({ kind: 'invalid' });
  await expect(repo.finishRound(round.id, round.revision)).rejects.toMatchObject({ kind: 'invalid' });
  await expect(repo.discardDraft(round.id, 19, round.revision)).rejects.toMatchObject({ kind: 'invalid' });
  await expect(repo.saveDraft(round.id, hole(2), round.revision)).rejects.toMatchObject({ kind: 'invalid' });
  await expect(repo.saveDraft(round.id, hole(1), NaN)).rejects.toMatchObject({ kind: 'invalid' });
  expect(await repo.getRound(round.id)).toEqual(round);
  await expect(repo.getRound('missing')).rejects.toMatchObject({ kind: 'not-found' });
  await expect(repo.saveHole('missing', hole(1), 0)).rejects.toMatchObject({ kind: 'not-found' });
  round = await repo.saveHole(round.id, hole(1), round.revision);
  expect(round.revision).toBe(1);
});

test.each([
  { number: 0 }, { number: 19 }, { par: 2 }, { par: 6 }, { strokes: 0 }, { putts: -1 },
  { strokes: NaN }, { strokes: Infinity }, { putts: 0.5 }, { strokes: Number.MAX_SAFE_INTEGER + 1 },
  { fairway: 'unknown' }, { fairway: undefined },
])('rejects structurally invalid draft %j without replacing data', async (change) => {
  const repo = repository(await fixture.open());
  const round = await repo.createRound('2026-10-15');
  await expect(repo.saveDraft(round.id, { ...hole(1), ...change } as HoleDraft, 0)).rejects.toMatchObject({ kind: 'invalid' });
  expect(await repo.getRound(round.id)).toEqual(round);
});

test('rejects malformed stored records instead of omitting them from indexed reads', async () => {
  const db = await fixture.open();
  const repo = repository(db);
  const round = await repo.createRound('2026-10-15');
  const malformed: unknown[] = [
    { ...round, status: 'unknown' }, { ...round, holes: [null] }, { ...round, drafts: null },
    { ...round, drafts: { 1: hole(2) } }, { ...round, drafts: { 2: hole(2) }, activeHole: 2 },
    { ...round, drafts: { 1: hole(1) }, activeHole: '1' }, { ...round, activeHole: null },
    { ...round, drafts: { 1: { ...hole(1), par: 7 } } },
  ];
  for (const item of malformed) {
    await db.put('rounds', item as StoredRound);
    await expect(repo.getRound(round.id)).rejects.toMatchObject({ kind: 'corrupt' });
    await expect(repo.getInProgress()).rejects.toMatchObject({ kind: 'corrupt' });
    await expect(repo.listFinished()).rejects.toMatchObject({ kind: 'corrupt' });
    expect(await db.count('rounds')).toBe(1);
  }
});

test('invalid dates/identities and repeated generated ids never overwrite records', async () => {
  const db = await fixture.open();
  await expect(createRoundRepository(db, () => '').createRound('2026-10-15')).rejects.toMatchObject({ kind: 'invalid' });
  await expect(repository(db).createRound('2026-02-30')).rejects.toMatchObject({ kind: 'invalid' });
  const repo = createRoundRepository(db, () => 'same-id');
  const round = await play(repo, 9);
  const finished = await repo.finishRound(round.id, round.revision);
  await expect(repo.createRound('2026-10-16')).rejects.toMatchObject({ kind: 'conflict' });
  expect(await repo.getRound(round.id)).toEqual(finished);
});

test('finished history sorts date descending then id ascending', async () => {
  const db = await fixture.open();
  for (const [id, date] of [['z', '2026-10-15'], ['b', '2026-10-16'], ['a', '2026-10-16']]) {
    if (!id || !date) throw new Error('Invalid fixture');
    const repo = createRoundRepository(db, () => id);
    const round = await play(repo, 9, date);
    await repo.finishRound(id, round.revision);
  }
  expect((await repository(db).listFinished()).map((round) => round.id)).toEqual(['a', 'b', 'z']);
});

test('stored cursor and revision boundary guards reject impossible state', async () => {
  const db = await fixture.open();
  const repo = repository(db);
  const round = await repo.createRound('2026-10-15');
  await db.put('rounds', { ...round, revision: Number.MAX_SAFE_INTEGER });
  await expect(repo.saveHole(round.id, hole(1), Number.MAX_SAFE_INTEGER)).rejects.toMatchObject({ kind: 'invalid' });
  expect(() => validateStoredRound({ ...round, drafts: { 1: hole(1) }, activeHole: 19 })).toThrow(StorageError);
  await expect(repo.saveHole(round.id, null as unknown as Hole, Number.MAX_SAFE_INTEGER)).rejects.toMatchObject({ kind: 'invalid' });
});
