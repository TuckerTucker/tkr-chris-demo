import { afterEach, beforeEach, expect, test } from 'vitest';
import { unwrap } from 'idb';
import { DB_VERSION, openGolfDatabase, transact } from './database';
import { migrations } from './migrations';
import { databaseFixture, hole, play, repository } from './__tests__/support';

let fixture: ReturnType<typeof databaseFixture>;
beforeEach(() => { fixture = databaseFixture(); });
afterEach(async () => { await fixture.cleanup(); });

test('fresh v1 has three correctly keyed stores and indexes; reopen retains scores', async () => {
  let db = await fixture.open();
  expect(db.version).toBe(DB_VERSION);
  expect([...db.objectStoreNames]).toEqual(['par-memory', 'rounds', 'trash']);
  const tx = db.transaction(['rounds', 'trash', 'par-memory']);
  expect(tx.objectStore('rounds').keyPath).toBe('id');
  expect([...tx.objectStore('rounds').indexNames]).toEqual(['by-date', 'by-status']);
  expect(tx.objectStore('trash').keyPath).toBe('id');
  expect(tx.objectStore('par-memory').keyPath).toBe('holeNumber');
  await tx.done;
  const round = await play(repository(db), 1);
  db.close();
  db = await fixture.open();
  expect(await repository(db).getRound(round.id)).toEqual(round);
});

test('injected v2 migration runs once after v1 and preserves existing records', async () => {
  let db = await fixture.open();
  const round = await play(repository(db), 1);
  db.close();
  const versions: number[] = [];
  const steps = [...migrations, (database: typeof db): void => { versions.push(database.version); }];
  db = await fixture.open({ version: 2, migrations: steps });
  expect(versions).toEqual([2]);
  expect(await repository(db).getRound(round.id)).toEqual(round);
  db.close();
  db = await fixture.open({ version: 2, migrations: steps });
  expect(versions).toEqual([2]);
  expect(db.version).toBe(2);
});

test('failed v2 migration atomically rolls schema changes back and retains the original cause', async () => {
  let db = await fixture.open();
  const round = await play(repository(db), 1);
  db.close();
  const cause = new Error('test migration cannot proceed');
  await expect(fixture.open({ version: 2, migrations: [...migrations, (_database, tx): void => {
    tx.objectStore('rounds').deleteIndex('by-date');
    throw cause;
  }] })).rejects.toMatchObject({ kind: 'io', cause });
  db = await fixture.open();
  expect(db.version).toBe(1);
  expect([...db.transaction('rounds').store.indexNames]).toContain('by-date');
  expect(await repository(db).getRound(round.id)).toEqual(round);
});

test('native blocked upgrade rejects promptly and its eventual successful connection is closed', async () => {
  const db = await fixture.open();
  db.close();
  const holder = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(fixture.name, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await expect(openGolfDatabase(fixture.name, { version: 2, migrations: [...migrations, (): void => undefined] }))
      .rejects.toMatchObject({ kind: 'blocked' });
  } finally { holder.close(); }
  // This open queues after the rejected request; cleanup can delete only if its late connection closed.
  const reopened = await fixture.open({ version: 2, migrations: [...migrations, (): void => undefined] });
  expect(reopened.version).toBe(2);
});

test('versionchange drains writes and closes the older connection before notifying its owner', async () => {
  const events: string[] = [];
  let notified: () => void = (): void => undefined;
  const notification = new Promise<void>((resolve) => { notified = resolve; });
  const db = await fixture.open({ onVersionChange: () => { events.push('versionchange'); notified(); } });
  const writing = repository(db).createRound('2026-10-15').then((round) => { events.push('committed'); return round; });
  const newer = await fixture.open({ version: 2, migrations: [...migrations, (): void => undefined] });
  const round = await writing;
  await notification;
  expect(events).toEqual(['committed', 'versionchange']);
  expect(await repository(newer).getRound(round.id)).toEqual(round);
  await expect(repository(db).getRound(round.id)).rejects.toMatchObject({ kind: 'io' });
});

test('aborted real readwrite transaction rolls back and returns a typed recoverable failure', async () => {
  const db = await fixture.open();
  await expect(transact(db, ['par-memory'], 'readwrite', async (tx) => {
    await tx.objectStore('par-memory').put({ holeNumber: 1, par: 3 });
    tx.abort();
  })).rejects.toMatchObject({ kind: 'io' });
  expect(await db.get('par-memory', 1)).toBeUndefined();
});

test.each(['append', 'correct'])('failed native par write rolls back %s scores, draft, cursor and memory', async (operation) => {
  let db = await fixture.open();
  let repo = repository(db);
  let round = await play(repo, 1);
  const number = operation === 'append' ? 2 : 1;
  round = await repo.saveDraft(round.id, { ...hole(number), fairway: null }, round.revision);
  db.close();
  // A deliberately incompatible test schema makes IndexedDB itself reject the missing key.
  db = await fixture.open({ version: 2, migrations: [...migrations, (database, tx): void => {
    database.deleteObjectStore('par-memory');
    database.createObjectStore('par-memory', { keyPath: 'required' });
    unwrap(tx.objectStore('par-memory')).put({ required: number, holeNumber: number, par: 4 });
  }] });
  repo = repository(db);
  await expect(operation === 'append'
    ? repo.saveHole(round.id, hole(number, 3), round.revision)
    : repo.updateHole(round.id, hole(number, 3), round.revision)).rejects.toMatchObject({ kind: 'io' });
  expect(await repo.getRound(round.id)).toEqual(round);
  expect(await db.get('par-memory', number)).toMatchObject({ holeNumber: number, par: 4 });
});

test('incomplete migration paths reject without creating a database', async () => {
  await expect(fixture.open({ version: 2 })).rejects.toMatchObject({ kind: 'invalid' });
  await expect(fixture.open({ version: 0 })).rejects.toMatchObject({ kind: 'invalid' });
  const db = await fixture.open();
  expect(db.version).toBe(1);
});
