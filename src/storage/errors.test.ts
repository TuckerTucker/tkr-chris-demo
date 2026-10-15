import { describe, expect, it } from 'vitest';
import { StorageError, toStorageError } from './errors';

describe('actionable storage errors', () => {
  it.each([
    ['QuotaExceededError', 'quota'],
    ['SecurityError', 'unavailable'],
    ['NotSupportedError', 'unavailable'],
    ['BlockedError', 'blocked'],
    ['AbortError', 'io'],
    ['InvalidStateError', 'io'],
    ['UnknownError', 'io'],
  ] as const)('maps %s to %s while preserving the native cause', (name, kind) => {
    const cause = new DOMException('native failure', name);
    const error = toStorageError(cause);
    expect(error.kind).toBe(kind);
    expect(error.cause).toBe(cause);
    expect(error.fixHint.length).toBeGreaterThan(15);
    expect(error.fixHint).not.toMatch(/private browsing|incognito/i);
  });

  it('preserves typed errors, detailed fields and the exact original cause', () => {
    const cause = new DOMException('disk full', 'QuotaExceededError');
    const fieldErrors = [{ field: 'putts', code: 'putts-not-below-strokes', message: 'Putts must be fewer than strokes.' }] as const;
    const original = new StorageError('invalid', 'This edit needs correction.', { cause, fieldErrors, fixHint: 'Reduce putts or increase strokes.' });
    const result = toStorageError(original);
    expect(result).toBe(original);
    expect(result.fieldErrors).toBe(fieldErrors);
    expect(result.cause).toBe(cause);
    expect(result.fixHint).toBe('Reduce putts or increase strokes.');
  });

  it.each([undefined, null, 'unexpected', { reason: 'driver failed' }])('keeps unknown failure as an I/O cause without inventing corruption', (cause) => {
    const result = toStorageError(cause);
    expect(result.kind).toBe('io');
    expect(result.cause).toBe(cause);
    expect(result.fixHint).toContain('retry');
  });
});
