import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import type { HoleDraft, Round } from '../domain';
import { StorageError, toStorageError } from './errors';
import { migrations } from './migrations';

export const DB_VERSION = 1;

/** Confirmed scores and bounded recoverable edits share one durable record. */
export interface StoredRound extends Round {
  readonly drafts: Readonly<Record<number, HoleDraft>>;
  readonly activeHole: number | null;
}

export interface TrashedRound {
  readonly id: string;
  readonly token: string;
  readonly round: StoredRound;
}

export interface GolfDB extends DBSchema {
  rounds: { key: string; value: StoredRound; indexes: { 'by-status': string; 'by-date': string } };
  trash: { key: string; value: TrashedRound };
  'par-memory': { key: number; value: { holeNumber: number; par: number } };
}

export type Migration = (db: IDBPDatabase<GolfDB>,
  tx: IDBPTransaction<GolfDB, StoreNames<GolfDB>[], 'versionchange'>) => void;

export interface OpenDatabaseOptions {
  readonly version?: number;
  readonly migrations?: readonly Migration[];
  readonly onVersionChange?: () => void;
  readonly onTerminated?: () => void;
}

const pending = new WeakMap<IDBPDatabase<GolfDB>, Set<Promise<void>>>();

/** Open forward-only migrations; blocked requests reject and close any late connection. */
export async function openGolfDatabase(name: string, options: OpenDatabaseOptions = {}): Promise<IDBPDatabase<GolfDB>> {
  const version = options.version ?? DB_VERSION;
  const steps = options.migrations ?? migrations;
  if (!Number.isSafeInteger(version) || version < 1 || steps.length < version) {
    throw new StorageError('invalid', 'The database version has no complete migration path.');
  }
  try {
    if (typeof indexedDB === 'undefined') throw new StorageError('unavailable', 'IndexedDB is not supported.');
    return await new Promise<IDBPDatabase<GolfDB>>((resolve, reject) => {
      let rejected = false;
      let migrationFailed = false;
      let migrationFailure: unknown;
      let connection: IDBPDatabase<GolfDB> | undefined;
      const opening = openDB<GolfDB>(name, version, {
        upgrade(db, oldVersion, newVersion, tx) {
          // idb creates this promise when wrapping the native upgrade transaction.
          // Opening's error handler reports the failure; consume the companion rejection too.
          void tx.done.catch(() => undefined);
          try {
            for (let target = oldVersion + 1; target <= (newVersion ?? version); target += 1) {
              const migrate = steps[target - 1];
              if (!migrate) throw new StorageError('invalid', `Migration ${target} is missing.`);
              migrate(db, tx);
            }
          } catch (error) {
            migrationFailed = true;
            migrationFailure = error;
            tx.abort();
          }
        },
        blocked() {
          rejected = true;
          reject(new StorageError('blocked', 'Another tab is holding an older database connection.'));
        },
        blocking() {
          connection?.close();
          const writes = connection ? [...pending.get(connection) ?? []] : [];
          void Promise.allSettled(writes).then(() => {
            // Notify in the next task, after callers have observed their settled write promises.
            setTimeout(() => options.onVersionChange?.(), 0);
          });
        },
        terminated() { options.onTerminated?.(); },
      });
      void opening.then((db) => {
        connection = db;
        if (rejected) db.close();
        else resolve(db);
      }, (error: unknown) => reject(toStorageError(migrationFailed ? migrationFailure : error)));
    });
  } catch (error) { throw toStorageError(error); }
}

/** Complete or abort the entire transaction before returning a result or typed failure. */
export async function transact<T, Mode extends 'readonly' | 'readwrite'>(
  db: IDBPDatabase<GolfDB>, stores: StoreNames<GolfDB>[], mode: Mode,
  action: (tx: IDBPTransaction<GolfDB, StoreNames<GolfDB>[], Mode>) => Promise<T>,
): Promise<T> {
  let tx: IDBPTransaction<GolfDB, StoreNames<GolfDB>[], Mode> | undefined;
  try {
    tx = db.transaction(stores, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
    const active = pending.get(db) ?? new Set<Promise<void>>();
    pending.set(db, active);
    const done = tx.done;
    active.add(done);
    // Install the rejection handler immediately, including synchronous action failures.
    void done.then(() => active.delete(done), () => active.delete(done));
    const result = await action(tx);
    await tx.done;
    return result;
  } catch (error) {
    if (tx) {
      try { tx.abort(); } catch { /* A completed/aborted transaction cannot be aborted again. */ }
      await tx.done.catch(() => undefined);
    }
    throw toStorageError(error);
  }
}
