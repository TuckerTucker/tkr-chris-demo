import type { HoleError, RoundError } from '../domain';

export type StorageErrorKind = 'unavailable' | 'quota' | 'blocked' | 'corrupt'
  | 'not-found' | 'invalid' | 'conflict' | 'io';

const hints: Record<StorageErrorKind, string> = {
  unavailable: 'Saving is unavailable in this browser. Check site storage permissions or try a regular browser tab.',
  quota: 'Free some device storage, then retry. Your current edits are still here.',
  blocked: 'Close other tabs running this scorecard, then retry opening it.',
  corrupt: 'Stored scorecard data could not be read safely. Keep this browser data and retry after updating the app.',
  'not-found': 'Reload the current round or return to the round log.',
  invalid: 'Correct the indicated fields, then try again.',
  conflict: 'Another tab changed this round, or an active round or undo is pending. Reload and compare your edits before reapplying them.',
  io: 'Your changes were not saved. Keep this page open and retry.',
};

/** A recoverable persistence failure with contextual validation diagnostics. */
export class StorageError extends Error {
  readonly kind: StorageErrorKind;
  readonly fixHint: string;
  readonly fieldErrors?: readonly (HoleError | RoundError)[];

  constructor(kind: StorageErrorKind, message: string, options: {
    cause?: unknown; fieldErrors?: readonly (HoleError | RoundError)[]; fixHint?: string;
  } = {}) {
    super(message, { cause: options.cause });
    this.name = 'StorageError';
    this.kind = kind;
    this.fixHint = options.fixHint ?? hints[kind];
    this.fieldErrors = options.fieldErrors;
  }
}

/** Preserves existing typed failures and maps native browser storage errors. */
export function toStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  const kind: StorageErrorKind = name === 'QuotaExceededError' ? 'quota'
    : name === 'SecurityError' || name === 'NotSupportedError' ? 'unavailable'
      : name === 'BlockedError' ? 'blocked' : 'io';
  return new StorageError(kind, 'The scorecard could not complete this storage operation.', { cause: error });
}
