import type { IDBPDatabase } from 'idb';
import { canFinish, nextStep, validateHole, validateHoleDraft, validateRound } from '../domain';
import type { Hole, HoleDraft, HoleError, RoundError } from '../domain';
import type { GolfDB, StoredRound, TrashedRound } from './database';
import { transact } from './database';
import { StorageError } from './errors';

export interface RoundRepository {
  createRound(date: string): Promise<StoredRound>;
  saveDraft(roundId: string, draft: HoleDraft, expectedRevision: number): Promise<StoredRound>;
  discardDraft(roundId: string, holeNumber: number, expectedRevision: number): Promise<StoredRound>;
  saveHole(roundId: string, hole: Hole, expectedRevision: number): Promise<StoredRound>;
  updateHole(roundId: string, hole: Hole, expectedRevision: number): Promise<StoredRound>;
  continueRound(roundId: string, expectedRevision: number): Promise<StoredRound>;
  finishRound(roundId: string, expectedRevision: number): Promise<StoredRound>;
  getInProgress(): Promise<StoredRound | undefined>;
  listFinished(): Promise<StoredRound[]>;
  getRound(roundId: string): Promise<StoredRound>;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function draftErrors(value: unknown): HoleError[] {
  const errors = validateHoleDraft(value as HoleDraft).filter((error) =>
    error.code.endsWith('-integer') || error.code.endsWith('-range') || error.code === 'fairway-invalid');
  if (!record(value) || !['hit', 'missed', 'n/a', null].includes(value.fairway as string | null)) {
    errors.push({ field: 'fairway', code: 'fairway-invalid', message: 'Choose hit, missed, not applicable, or leave fairway unanswered.' });
  }
  return errors;
}

function legalTarget(round: StoredRound, number: number): boolean {
  return Number.isSafeInteger(number) && number >= 1
    && (number <= round.holes.length || (nextStep(round) === 'enter-hole' && number === round.holes.length + 1));
}

function cursor(round: StoredRound): number | null {
  const first = Object.keys(round.drafts).map(Number).sort((a, b) => a - b)[0];
  return first ?? (nextStep(round) === 'enter-hole' ? round.holes.length + 1 : null);
}

/** Validate every persisted field before exposing a record, including recoverable partial edits. */
export function validateStoredRound(value: unknown): StoredRound {
  const errors: (HoleError | RoundError)[] = validateRound(value as StoredRound);
  if (errors.length) throw new StorageError('corrupt', 'The stored round contains invalid scores or lifecycle data.', { fieldErrors: errors });
  const round = value as StoredRound;
  if (!record(round.drafts) || Object.keys(round.drafts).length > 18) {
    throw new StorageError('corrupt', 'The stored round has an invalid draft collection.');
  }
  for (const [key, draft] of Object.entries(round.drafts)) {
    const issues = draftErrors(draft);
    if (issues.length || String(draft.number) !== key || !legalTarget(round, draft.number)) {
      throw new StorageError('corrupt', 'A saved draft does not belong to a playable hole.', { fieldErrors: issues });
    }
  }
  const hasDrafts = Object.keys(round.drafts).length > 0;
  if ((hasDrafts && (round.activeHole === null || !Number.isSafeInteger(round.activeHole) || !Object.hasOwn(round.drafts, round.activeHole)))
    || (!hasDrafts && round.activeHole !== cursor(round))) {
    throw new StorageError('corrupt', 'The saved editor position does not match the round.');
  }
  return round;
}

/** Full-store validation prevents malformed unindexed records from disappearing from history. */
export function validateRounds(values: unknown[]): StoredRound[] {
  const rounds = values.map(validateStoredRound);
  if (rounds.filter((round) => round.status === 'in-progress').length > 1) {
    throw new StorageError('corrupt', 'More than one active round is stored.');
  }
  return rounds;
}

/** The installation owns one persistent removal token, including all embedded drafts. */
export function validateTrash(values: unknown[]): TrashedRound | undefined {
  if (values.length > 1) throw new StorageError('corrupt', 'More than one undo item is stored.');
  const value = values[0];
  if (value === undefined) return undefined;
  if (!record(value) || typeof value.token !== 'string' || !value.token.trim()) {
    throw new StorageError('corrupt', 'The pending removal token is invalid.');
  }
  const round = validateStoredRound(value.round);
  if (value.id !== round.id) throw new StorageError('corrupt', 'The pending removal belongs to a different round.');
  return { id: round.id, token: value.token, round };
}

/** Reject stale and invalid revision values before any durable change. */
export function checkRevision(round: StoredRound, expectedRevision: number): void {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new StorageError('invalid', 'The expected round revision is invalid.', {
      fieldErrors: [{ field: 'revision', code: 'revision-invalid', message: 'Reload the round before saving.' }],
    });
  }
  if (round.revision !== expectedRevision) throw new StorageError('conflict', 'This round changed in another tab.');
}

/** Increment revisions safely for edits and restores. */
export function incrementRevision(round: StoredRound): StoredRound {
  if (round.revision === Number.MAX_SAFE_INTEGER) throw new StorageError('invalid', 'The round revision limit was reached.');
  return { ...round, revision: round.revision + 1 };
}

/** Read a required record without confusing absence with malformed data. */
export function requiredRound(value: unknown): StoredRound {
  if (value === undefined) throw new StorageError('not-found', 'This round is no longer available.');
  return validateStoredRound(value);
}

/** Create the durable repository over an injected connection and identity source. */
export function createRoundRepository(db: IDBPDatabase<GolfDB>, ids: () => string): RoundRepository {
  async function mutate(id: string, revision: number, change: (round: StoredRound) => StoredRound,
    hole?: Hole): Promise<StoredRound> {
    return transact(db, ['rounds', 'par-memory'], 'readwrite', async (tx) => {
      const store = tx.objectStore('rounds');
      const current = requiredRound(await store.get(id));
      checkRevision(current, revision);
      const updated = incrementRevision(change(current));
      const errors = validateRound(updated);
      if (errors.length) throw new StorageError('invalid', 'This change would leave an invalid round.', { fieldErrors: errors });
      validateStoredRound(updated);
      await store.put(updated);
      if (hole) await tx.objectStore('par-memory').put({ holeNumber: hole.number, par: hole.par });
      return updated;
    });
  }

  function confirm(round: StoredRound, hole: Hole, correction: boolean): StoredRound {
    const errors = validateHole(hole);
    if (errors.length) throw new StorageError('invalid', 'Correct the hole before confirming it.', { fieldErrors: errors });
    if (correction ? hole.number > round.holes.length
      : nextStep(round) !== 'enter-hole' || hole.number !== round.holes.length + 1) {
      throw new StorageError('invalid', correction ? 'Only a recorded hole can be corrected.' : 'Record only the next available hole.', {
        fieldErrors: [{ field: 'number', code: 'hole-target', message: correction ? 'Choose a recorded hole.' : 'Complete the current hole or turn decision first.' }],
      });
    }
    const holes = [...round.holes];
    holes[hole.number - 1] = { ...hole };
    const drafts = Object.fromEntries(Object.entries(round.drafts).filter(([key]) => Number(key) !== hole.number));
    const updated = { ...round, holes, drafts };
    return { ...updated, activeHole: cursor(updated) };
  }

  return {
    async createRound(date): Promise<StoredRound> {
      return transact(db, ['rounds', 'trash'], 'readwrite', async (tx) => {
        const rounds = validateRounds(await tx.objectStore('rounds').getAll());
        const trash = validateTrash(await tx.objectStore('trash').getAll());
        if (rounds.some((round) => round.status === 'in-progress') || trash?.round.status === 'in-progress') {
          throw new StorageError('conflict', 'Resume your active round, or resolve its pending Undo before starting another.');
        }
        const round: StoredRound = { id: ids(), date, revision: 0, continuedTo18: false,
          status: 'in-progress', holes: [], drafts: {}, activeHole: 1 };
        const errors = validateRound(round);
        if (errors.length) throw new StorageError('invalid', 'A round needs a valid identity and date.', { fieldErrors: errors });
        if (rounds.some((item) => item.id === round.id) || trash?.id === round.id) {
          throw new StorageError('conflict', 'A round already uses this identifier. Retry with a new identifier.');
        }
        await tx.objectStore('rounds').add(round);
        return round;
      });
    },
    async saveDraft(id, draft, revision): Promise<StoredRound> {
      return mutate(id, revision, (round) => {
        const errors = draftErrors(draft);
        if (errors.length) throw new StorageError('invalid', 'The draft contains unsupported field values.', { fieldErrors: errors });
        if (!legalTarget(round, draft.number)) throw new StorageError('invalid', 'This hole is not available for editing.', {
          fieldErrors: [{ field: 'number', code: 'draft-target', message: 'Choose a recorded hole or the next available hole.' }],
        });
        return { ...round, drafts: { ...round.drafts, [draft.number]: { number: draft.number, par: draft.par,
          strokes: draft.strokes, putts: draft.putts, fairway: draft.fairway } }, activeHole: draft.number };
      });
    },
    async discardDraft(id, number, revision): Promise<StoredRound> {
      return mutate(id, revision, (round) => {
        if (!legalTarget(round, number)) throw new StorageError('invalid', 'Choose a recorded or available hole.');
        const drafts = Object.fromEntries(Object.entries(round.drafts).filter(([key]) => Number(key) !== number));
        const updated = { ...round, drafts };
        return { ...updated, activeHole: cursor(updated) };
      });
    },
    async saveHole(id, hole, revision): Promise<StoredRound> {
      return mutate(id, revision, (round) => confirm(round, hole, false), hole);
    },
    async updateHole(id, hole, revision): Promise<StoredRound> {
      return mutate(id, revision, (round) => confirm(round, hole, true), hole);
    },
    async continueRound(id, revision): Promise<StoredRound> {
      return mutate(id, revision, (round) => {
        if (nextStep(round) !== 'turn') throw new StorageError('invalid', 'Continue only after completing the front nine.');
        const updated = { ...round, continuedTo18: true };
        return { ...updated, activeHole: cursor(updated) };
      });
    },
    async finishRound(id, revision): Promise<StoredRound> {
      return mutate(id, revision, (round) => {
        if (!canFinish(round)) throw new StorageError('invalid', 'Finish at 9 holes, or at 18 after choosing to continue.');
        if (Object.keys(round.drafts).length) throw new StorageError('invalid', 'A correction is still unfinished.', {
          fieldErrors: [{ field: 'holes', code: 'unresolved-drafts', message: 'Confirm or discard your hole corrections before finishing.' }],
          fixHint: 'Confirm or discard your hole corrections before finishing.',
        });
        return { ...round, status: 'finished', activeHole: null };
      });
    },
    async getInProgress(): Promise<StoredRound | undefined> {
      return transact(db, ['rounds'], 'readonly', async (tx) =>
        validateRounds(await tx.objectStore('rounds').getAll()).find((round) => round.status === 'in-progress'));
    },
    async listFinished(): Promise<StoredRound[]> {
      return transact(db, ['rounds'], 'readonly', async (tx) =>
        validateRounds(await tx.objectStore('rounds').getAll()).filter((round) => round.status === 'finished')
          .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)));
    },
    async getRound(id): Promise<StoredRound> {
      return transact(db, ['rounds'], 'readonly', async (tx) => requiredRound(await tx.objectStore('rounds').get(id)));
    },
  };
}
