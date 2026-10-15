import { afterEach, beforeEach, expect, test } from 'vitest';
import { createManualParSource } from '../domain';
import { createParMemory } from './par-memory';
import { createStorage } from './index';
import { databaseFixture, hole } from './__tests__/support';

let fixture: ReturnType<typeof databaseFixture>;
beforeEach(() => { fixture = databaseFixture(); });
afterEach(async () => { await fixture.cleanup(); });

test('remembered par replaces one bounded entry and feeds the manual source after reopen', async () => {
  let db = await fixture.open();
  let memory = createParMemory(db);
  expect(await memory.lastPar(7)).toBeUndefined();
  expect(await createManualParSource(memory).suggestPar(7)).toBe(4);
  await memory.rememberPar(7, 3);
  await memory.rememberPar(7, 5);
  expect(await db.count('par-memory')).toBe(1);
  db.close();
  db = await fixture.open();
  memory = createParMemory(db);
  expect(await memory.lastPar(7)).toBe(5);
  expect(await createManualParSource(memory).suggestPar(7)).toBe(5);
  for (let number = 1; number <= 18; number += 1) {
    await memory.rememberPar(number, 3);
    await memory.rememberPar(number, 4);
  }
  expect(await db.count('par-memory')).toBe(18);
});

test.each([0, 19, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid hole %s for both reading and writing', async (number) => {
  const db = await fixture.open();
  const memory = createParMemory(db);
  await expect(memory.rememberPar(number, 4)).rejects.toMatchObject({ kind: 'invalid', fieldErrors: [{ field: 'number' }] });
  await expect(memory.lastPar(number)).rejects.toMatchObject({ kind: 'invalid' });
  expect(await db.count('par-memory')).toBe(0);
});

test.each([2, 6, -1, NaN, Infinity, 3.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid par %s without replacing memory', async (par) => {
  const memory = createParMemory(await fixture.open());
  await memory.rememberPar(1, 4);
  await expect(memory.rememberPar(1, par)).rejects.toMatchObject({ kind: 'invalid', fieldErrors: [{ field: 'par' }] });
  expect(await memory.lastPar(1)).toBe(4);
});

test('malformed remembered par surfaces corruption through the domain source', async () => {
  const db = await fixture.open();
  await db.put('par-memory', { holeNumber: 7, par: 6 });
  const memory = createParMemory(db);
  await expect(memory.lastPar(7)).rejects.toMatchObject({ kind: 'corrupt' });
  await expect(createManualParSource(memory).suggestPar(7)).rejects.toMatchObject({ kind: 'corrupt' });
});

test('factory shares committed hole memory and closes every storage port', async () => {
  const storage = await createStorage(fixture.name, { ids: () => 'factory-round' });
  try {
    const round = await storage.repository.createRound('2026-10-15');
    const saved = await storage.repository.saveHole(round.id, hole(1, 3), round.revision);
    expect(await storage.parMemory.lastPar(1)).toBe(3);
    await storage.trash.removeRound(saved.id, saved.revision);
    expect((await storage.trash.getPendingRemoval())?.round.id).toBe(saved.id);
  } finally { storage.close(); }
  await expect(storage.parMemory.lastPar(1)).rejects.toMatchObject({ kind: 'io' });
  await expect(storage.parMemory.rememberPar(1, 5)).rejects.toMatchObject({ kind: 'io' });
  await expect(storage.repository.getInProgress()).rejects.toMatchObject({ kind: 'io' });
});
