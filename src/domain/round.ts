import type { Hole } from './hole';
import { validateHole } from './hole';

export type RoundStatus = 'in-progress' | 'finished';

/** Persisted round state; completion and the turn decision survive restarts. */
export interface Round {
  readonly id: string;
  readonly date: string;
  readonly revision: number;
  readonly continuedTo18: boolean;
  readonly status: RoundStatus;
  readonly holes: readonly Hole[];
}

export type NextStep = 'enter-hole' | 'turn' | 'finish' | 'finished';

/** A round invariant failure, optionally associated with a hole position. */
export interface RoundError {
  readonly field: 'id' | 'date' | 'revision' | 'status' | 'continuedTo18' | 'holes';
  readonly code: string;
  readonly message: string;
  readonly holeNumber?: number;
}

/** Carries actionable diagnostics when deriving state from an invalid round. */
export class RoundValidationError extends Error {
  readonly errors: readonly RoundError[];

  constructor(errors: readonly RoundError[]) {
    super('The round contains invalid data.');
    this.name = 'RoundValidationError';
    this.errors = errors;
  }
}

function isCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (days[month - 1] ?? 0);
}

/** Returns every broken round invariant, including malformed persisted records. */
export function validateRound(round: Round): RoundError[] {
  const value: Partial<Record<keyof Round, unknown>> =
    round !== null && typeof round === 'object' && !Array.isArray(round) ? round : {};
  const errors: RoundError[] = [];
  if (typeof value.id !== 'string' || value.id.trim().length === 0) {
    errors.push({ field: 'id', code: 'id-required', message: 'A round identifier is required.' });
  }
  if (!isCalendarDate(value.date)) {
    errors.push({ field: 'date', code: 'date-invalid', message: 'Enter a valid date as yyyy-mm-dd.' });
  }
  if (typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0) {
    errors.push({ field: 'revision', code: 'revision-invalid', message: 'The round revision must be a nonnegative whole number.' });
  }
  if (value.status !== 'in-progress' && value.status !== 'finished') {
    errors.push({ field: 'status', code: 'status-invalid', message: 'The round status is invalid.' });
  }
  if (typeof value.continuedTo18 !== 'boolean') {
    errors.push({ field: 'continuedTo18', code: 'continuation-invalid', message: 'The turn decision must be recorded.' });
  }
  if (!Array.isArray(value.holes)) {
    errors.push({ field: 'holes', code: 'holes-invalid', message: 'The round must contain a list of holes.' });
    return errors;
  }

  const holes: unknown[] = value.holes;
  if (holes.length > 18) {
    errors.push({ field: 'holes', code: 'holes-too-many', message: 'A round may contain at most 18 holes.' });
  }
  // A normal for-loop deliberately validates sparse array positions too.
  for (let index = 0; index < holes.length; index += 1) {
    const hole = holes[index] as Hole;
    for (const error of validateHole(hole)) {
      errors.push({ field: 'holes', code: error.code, message: `Hole ${index + 1}: ${error.message}`, holeNumber: index + 1 });
    }
    if (hole === null || typeof hole !== 'object' || hole.number !== index + 1) {
      errors.push({ field: 'holes', code: 'holes-order', message: 'Holes must appear once each, in order starting at 1.', holeNumber: index + 1 });
    }
  }
  if (holes.length > 9 && value.continuedTo18 !== true) {
    errors.push({ field: 'continuedTo18', code: 'continuation-required', message: 'Choose to continue before recording the back nine.' });
  }
  if (holes.length < 9 && value.continuedTo18 === true) {
    errors.push({ field: 'continuedTo18', code: 'continuation-before-turn', message: 'Complete the front nine before continuing to 18.' });
  }
  if (value.status === 'finished'
    && !((holes.length === 9 && value.continuedTo18 === false)
      || (holes.length === 18 && value.continuedTo18 === true))) {
    errors.push({ field: 'status', code: 'finish-length', message: 'Finish at 9 holes, or at 18 after choosing to continue.' });
  }
  return errors;
}

/** Whether a valid, unfinished round is at its chosen finish boundary. */
export function canFinish(round: Round): boolean {
  if (validateRound(round).length !== 0 || round.status !== 'in-progress') return false;
  return (round.holes.length === 9 && !round.continuedTo18)
    || (round.holes.length === 18 && round.continuedTo18);
}

/** Derives navigation only from validated, durably recorded state. */
export function nextStep(round: Round): NextStep {
  const errors = validateRound(round);
  if (errors.length !== 0) throw new RoundValidationError(errors);
  if (round.status === 'finished') return 'finished';
  if (round.holes.length === 18) return 'finish';
  if (round.holes.length === 9 && !round.continuedTo18) return 'turn';
  return 'enter-hole';
}
