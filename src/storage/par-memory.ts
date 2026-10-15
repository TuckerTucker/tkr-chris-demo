import type { IDBPDatabase } from 'idb';
import type { ParMemory } from '../domain';
import { transact } from './database';
import type { GolfDB } from './database';
import { StorageError } from './errors';

export interface ParMemoryStore extends ParMemory {
  rememberPar(holeNumber: number, par: number): Promise<void>;
}

function validNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function requireHole(number: number): void {
  if (!validNumber(number, 1, 18)) throw new StorageError('invalid', 'Choose a hole from 1 to 18.', {
    fieldErrors: [{ field: 'number', code: 'number-range', message: 'Choose a hole from 1 to 18.' }],
  });
}

/** Bounded per-hole par memory; confirmed repository mutations already write this atomically. */
export function createParMemory(db: IDBPDatabase<GolfDB>): ParMemoryStore {
  return {
    async lastPar(holeNumber): Promise<number | undefined> {
      requireHole(holeNumber);
      return transact(db, ['par-memory'], 'readonly', async (tx) => {
        const value = await tx.objectStore('par-memory').get(holeNumber);
        if (value === undefined) return undefined;
        if (value === null || typeof value !== 'object' || value.holeNumber !== holeNumber || !validNumber(value.par, 3, 5)) {
          throw new StorageError('corrupt', 'The remembered par is invalid.');
        }
        return value.par;
      });
    },
    async rememberPar(holeNumber, par): Promise<void> {
      requireHole(holeNumber);
      if (!validNumber(par, 3, 5)) throw new StorageError('invalid', 'Choose a par from 3 to 5.', {
        fieldErrors: [{ field: 'par', code: 'par-range', message: 'Choose a par from 3 to 5.' }],
      });
      await transact(db, ['par-memory'], 'readwrite', async (tx) => {
        await tx.objectStore('par-memory').put({ holeNumber, par });
      });
    },
  };
}
