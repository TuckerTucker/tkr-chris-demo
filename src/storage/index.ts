import { openGolfDatabase } from './database';
import type { OpenDatabaseOptions } from './database';
import { createRoundRepository } from './round-repository';
import type { RoundRepository } from './round-repository';
import { createRoundTrash } from './round-trash';
import type { RoundTrash } from './round-trash';
import { createParMemory } from './par-memory';
import type { ParMemoryStore } from './par-memory';

export { StorageError, toStorageError } from './errors';
export type { StorageErrorKind } from './errors';
export { DB_VERSION, openGolfDatabase } from './database';
export type { GolfDB, Migration, OpenDatabaseOptions, StoredRound, TrashedRound } from './database';
export { migrations } from './migrations';
export { createRoundRepository } from './round-repository';
export type { RoundRepository } from './round-repository';
export { createRoundTrash } from './round-trash';
export type { PendingRemoval, RoundTrash } from './round-trash';
export { createParMemory } from './par-memory';
export type { ParMemoryStore } from './par-memory';

export interface Storage {
  readonly repository: RoundRepository;
  readonly trash: RoundTrash;
  readonly parMemory: ParMemoryStore;
  close(): void;
}

/** Open once and share the connection and injected identity source across storage ports. */
export async function createStorage(dbName: string,
  options: OpenDatabaseOptions & { ids?: () => string } = {}): Promise<Storage> {
  const db = await openGolfDatabase(dbName, options);
  const ids = options.ids ?? (() => crypto.randomUUID());
  return { repository: createRoundRepository(db, ids), trash: createRoundTrash(db, ids),
    parMemory: createParMemory(db), close: () => db.close() };
}
