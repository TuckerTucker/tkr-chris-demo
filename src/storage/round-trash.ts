import type { IDBPDatabase } from 'idb';
import type { GolfDB, StoredRound } from './database';
import { transact } from './database';
import { StorageError } from './errors';
import { checkRevision, incrementRevision, requiredRound, validateRounds, validateTrash } from './round-repository';

export interface PendingRemoval { readonly token: string; readonly round: StoredRound }

export interface RoundTrash {
  removeRound(roundId: string, expectedRevision: number): Promise<PendingRemoval>;
  getPendingRemoval(): Promise<PendingRemoval | undefined>;
  restoreRound(token: string): Promise<StoredRound>;
  purgeTrash(token: string): Promise<void>;
}

/** Create the persistent one-token undo buffer over the shared database. */
export function createRoundTrash(db: IDBPDatabase<GolfDB>, ids: () => string): RoundTrash {
  return {
    async removeRound(id, revision): Promise<PendingRemoval> {
      return transact(db, ['rounds', 'trash'], 'readwrite', async (tx) => {
        if (validateTrash(await tx.objectStore('trash').getAll())) {
          throw new StorageError('conflict', 'Undo or dismiss the previous removal first.');
        }
        const round = requiredRound(await tx.objectStore('rounds').get(id));
        checkRevision(round, revision);
        const token = ids();
        if (typeof token !== 'string' || !token.trim()) throw new StorageError('invalid', 'The removal token is invalid.');
        await tx.objectStore('trash').add({ id, token, round });
        await tx.objectStore('rounds').delete(id);
        return { token, round };
      });
    },
    async getPendingRemoval(): Promise<PendingRemoval | undefined> {
      return transact(db, ['trash'], 'readonly', async (tx) => {
        const item = validateTrash(await tx.objectStore('trash').getAll());
        return item ? { token: item.token, round: item.round } : undefined;
      });
    },
    async restoreRound(token): Promise<StoredRound> {
      return transact(db, ['rounds', 'trash'], 'readwrite', async (tx) => {
        const item = validateTrash(await tx.objectStore('trash').getAll());
        if (!item || item.token !== token) throw new StorageError('not-found', 'This removal has already been resolved.');
        const rounds = validateRounds(await tx.objectStore('rounds').getAll());
        if (rounds.some((round) => round.id === item.id
          || (item.round.status === 'in-progress' && round.status === 'in-progress'))) {
          throw new StorageError('conflict', 'Another round occupies this active slot or identifier.');
        }
        const round = incrementRevision(item.round);
        await tx.objectStore('rounds').add(round);
        await tx.objectStore('trash').delete(item.id);
        return round;
      });
    },
    async purgeTrash(token): Promise<void> {
      return transact(db, ['trash'], 'readwrite', async (tx) => {
        const item = validateTrash(await tx.objectStore('trash').getAll());
        if (!item || item.token !== token) throw new StorageError('not-found', 'This removal has already been resolved.');
        await tx.objectStore('trash').delete(item.id);
      });
    },
  };
}
