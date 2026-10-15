import { describe, expect, test } from 'vitest';
import { validateHole, validateHoleDraft } from './index';
import type { Hole, HoleDraft, HoleField } from './index';

const valid: Hole = { number: 1, par: 4, strokes: 4, putts: 2, fairway: 'hit' };

describe('hole validation', () => {
  test.each([
    ['ace', { ...valid, par: 3, strokes: 1, putts: 0, fairway: 'n/a' }],
    ['last hole', { ...valid, number: 18 }],
    ['par five', { ...valid, par: 5, fairway: 'missed' }],
    ['zero putts', { ...valid, putts: 0 }],
    ['maximum putts', { ...valid, putts: 3 }],
    ['safe integer boundary', { ...valid, strokes: Number.MAX_SAFE_INTEGER, putts: Number.MAX_SAFE_INTEGER - 1 }],
  ] as const)('%s is valid', (_name, hole) => {
    expect(validateHole(hole)).toEqual([]);
    expect(validateHoleDraft(hole)).toEqual([]);
  });

  test.each([
    ['number', 0, 'number-range'], ['number', 19, 'number-range'],
    ['par', 2, 'par-range'], ['par', 6, 'par-range'],
    ['strokes', 0, 'strokes-range'], ['putts', -1, 'putts-range'],
    ['putts', 4, 'putts-not-below-strokes'], ['putts', 5, 'putts-not-below-strokes'],
    ['fairway', 'n/a', 'fairway-applicable'], ['fairway', 'yes', 'fairway-invalid'],
    ['fairway', null, 'fairway-required'], ['fairway', undefined, 'fairway-required'],
  ] as const)('%s = %s reports %s', (field, value, code) => {
    const hole = { ...valid, [field]: value } as Hole;
    expect(validateHole(hole)).toContainEqual(expect.objectContaining({ field, code }));
    expect(validateHoleDraft(hole)).toEqual(validateHole(hole));
  });

  for (const field of ['number', 'par', 'strokes', 'putts'] as const) {
    test.each([NaN, Infinity, -Infinity, 3.5, Number.MAX_SAFE_INTEGER + 1, '4', null, undefined, {}, []])(
      `${field} rejects malformed value %s`, (value) => {
        expect(validateHole({ ...valid, [field]: value } as Hole)).toContainEqual(
          expect.objectContaining({ field, code: `${field}-integer` }),
        );
      },
    );
  }

  test.each(['hit', 'missed'] as const)('par three rejects fairway %s', (fairway) => {
    expect(validateHole({ ...valid, par: 3, fairway })).toContainEqual(
      expect.objectContaining({ field: 'fairway', code: 'fairway-not-applicable' }),
    );
  });

  test.each([null, undefined, [], 4, 'hole', true])('malformed record %s reports all fields', (value) => {
    const errors = validateHole(value as unknown as Hole);
    expect(errors.map((error) => error.field)).toEqual(['number', 'par', 'strokes', 'putts', 'fairway']);
  });

  test('reports all broken rules without changing the draft', () => {
    const draft: HoleDraft = Object.freeze({ number: 0, par: 2, strokes: 0, putts: -1, fairway: null });
    expect(validateHoleDraft(draft).map((error) => error.field)).toEqual(
      ['number', 'par', 'strokes', 'putts', 'fairway'] satisfies HoleField[],
    );
  });
});
