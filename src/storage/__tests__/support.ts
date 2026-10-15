import { deleteDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { Hole } from '../../domain';
import { createRoundRepository } from '../round-repository';
import type { RoundRepository } from '../round-repository';
import { openGolfDatabase } from '../database';
import type { GolfDB, OpenDatabaseOptions, StoredRound } from '../database';

/** Real browser database fixture; every connection is closed before deleting its unique database. */
export function databaseFixture(): {
  name: string; open(options?: OpenDatabaseOptions): Promise<IDBPDatabase<GolfDB>>; cleanup(): Promise<void>;
} {
  const name = `storage-test-${crypto.randomUUID()}`;
  const connections: IDBPDatabase<GolfDB>[] = [];
  return {
    name,
    async open(options): Promise<IDBPDatabase<GolfDB>> {
      const db = await openGolfDatabase(name, options);
      connections.push(db);
      return db;
    },
    async cleanup(): Promise<void> {
      for (const db of connections) {
        // Native readonly request promises may resolve before their transaction completes.
        try { await db.transaction(['rounds', 'trash', 'par-memory'], 'readwrite').done; }
        catch (error) { if (!(error instanceof DOMException) || error.name !== 'InvalidStateError') throw error; }
        db.close();
      }
      await new Promise<void>((resolve, reject) => {
        void deleteDB(name, { blocked() { reject(new Error(`A connection leaked for ${name}`)); } })
          .then(resolve, reject);
      });
    },
  };
}

/** A valid confirmed hole, independently editable by each test. */
export function hole(number: number, par = 4): Hole {
  return { number, par, strokes: par, putts: 2, fairway: par === 3 ? 'n/a' : 'hit' };
}

/** Use public mutations to reach a round boundary without bypassing storage rules. */
export async function play(repository: RoundRepository, count: number, date = '2026-10-15'): Promise<StoredRound> {
  let round = await repository.createRound(date);
  for (let number = 1; number <= count; number += 1) {
    if (number === 10) round = await repository.continueRound(round.id, round.revision);
    round = await repository.saveHole(round.id, hole(number), round.revision);
  }
  return round;
}

/** The actual repository with unique runtime-generated identities. */
export function repository(db: IDBPDatabase<GolfDB>): RoundRepository {
  return createRoundRepository(db, () => crypto.randomUUID());
}
