import type { Migration } from './database';

/** Entry zero creates version one; later entries migrate forward without replacing rounds. */
export const migrations: readonly Migration[] = [
  (db): void => {
    const rounds = db.createObjectStore('rounds', { keyPath: 'id' });
    rounds.createIndex('by-status', 'status');
    rounds.createIndex('by-date', 'date');
    db.createObjectStore('trash', { keyPath: 'id' });
    db.createObjectStore('par-memory', { keyPath: 'holeNumber' });
  },
];
