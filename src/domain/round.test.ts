import { describe, expect, test } from 'vitest';
import { canFinish, nextStep, RoundValidationError, validateRound } from './index';
import type { Hole, NextStep, Round, RoundError, RoundStatus } from './index';

function makeRound(count = 0, continuedTo18 = count > 9, status: RoundStatus = 'in-progress'): Round {
  return {
    id: 'round-1', date: '2026-10-15', revision: 0, continuedTo18, status,
    holes: Array.from({ length: count }, (_, index): Hole => ({
      number: index + 1, par: 4, strokes: 4, putts: 2, fairway: 'hit',
    })),
  };
}

describe('round states', () => {
  const cases: readonly [number, boolean, RoundStatus, NextStep, boolean][] = [
    [0, false, 'in-progress', 'enter-hole', false],
    [8, false, 'in-progress', 'enter-hole', false],
    [9, false, 'in-progress', 'turn', true],
    [9, true, 'in-progress', 'enter-hole', false],
    [10, true, 'in-progress', 'enter-hole', false],
    [17, true, 'in-progress', 'enter-hole', false],
    [18, true, 'in-progress', 'finish', true],
    [9, false, 'finished', 'finished', false],
    [18, true, 'finished', 'finished', false],
  ];
  test.each(cases)('%s holes, continued %s, %s yields %s', (count, continued, status, step, finish) => {
    const round = makeRound(count, continued, status);
    expect(validateRound(round)).toEqual([]);
    expect(nextStep(round)).toBe(step);
    expect(canFinish(round)).toBe(finish);
  });

  test.each([
    [8, false, 'finished', 'finish-length'],
    [9, true, 'finished', 'finish-length'],
    [17, true, 'finished', 'finish-length'],
    [10, false, 'in-progress', 'continuation-required'],
    [18, false, 'finished', 'continuation-required'],
    [8, true, 'in-progress', 'continuation-before-turn'],
    [19, true, 'in-progress', 'holes-too-many'],
  ] as const)('rejects invalid state %s/%s/%s', (count, continued, status, code) => {
    const round = makeRound(count, continued, status);
    expect(validateRound(round)).toContainEqual(expect.objectContaining({ code }));
    expect(canFinish(round)).toBe(false);
    expect(() => nextStep(round)).toThrow(RoundValidationError);
    try {
      nextStep(round);
    } catch (error) {
      expect(error).toMatchObject({ name: 'RoundValidationError', errors: validateRound(round) });
    }
  });
});

describe('persisted round validation', () => {
  test.each(['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2026-04-30'])(
    'accepts Gregorian date %s', (date) => expect(validateRound({ ...makeRound(), date })).toEqual([]),
  );
  test.each(['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29',
    '2026-04-31', '2026-00-10', '2026-13-01', '2026-01-00', '2026-01-32', '2026-1-01',
    '2026-10-15T00:00:00Z', '2026-10-15\n', '', null, {}, 20261015])('rejects date %s', (date) => {
    expect(validateRound({ ...makeRound(), date } as Round)).toContainEqual(
      expect.objectContaining({ field: 'date', code: 'date-invalid' }),
    );
  });

  const malformed: readonly [keyof Round, unknown, string][] = [
    ['id', '', 'id-required'], ['id', '  ', 'id-required'], ['id', 1, 'id-required'],
    ['revision', -1, 'revision-invalid'], ['revision', 1.5, 'revision-invalid'],
    ['revision', NaN, 'revision-invalid'], ['revision', Infinity, 'revision-invalid'],
    ['revision', Number.MAX_SAFE_INTEGER + 1, 'revision-invalid'], ['revision', '1', 'revision-invalid'],
    ['revision', null, 'revision-invalid'], ['status', 'completed', 'status-invalid'],
    ['status', null, 'status-invalid'], ['continuedTo18', 'true', 'continuation-invalid'],
    ['continuedTo18', 1, 'continuation-invalid'], ['continuedTo18', null, 'continuation-invalid'],
    ['holes', null, 'holes-invalid'], ['holes', {}, 'holes-invalid'], ['holes', 'holes', 'holes-invalid'],
  ];
  test.each(malformed)('rejects %s = %s', (field, value, code) => {
    expect(validateRound({ ...makeRound(), [field]: value } as Round)).toContainEqual(
      expect.objectContaining({ field, code }),
    );
  });

  test('accepts the maximum safe revision', () => {
    expect(validateRound({ ...makeRound(), revision: Number.MAX_SAFE_INTEGER })).toEqual([]);
  });

  test.each([null, undefined, [], 'round', 1, true])('rejects malformed record %s without throwing', (value) => {
    const round = value as unknown as Round;
    expect(validateRound(round).map((error) => error.field)).toEqual(
      ['id', 'date', 'revision', 'status', 'continuedTo18', 'holes'] satisfies RoundError['field'][],
    );
    expect(canFinish(round)).toBe(false);
  });

  test.each([[1, 1], [1, 3], [2, 1], [2]])('rejects hole numbers %s', (...numbers) => {
    const hole: Hole = { number: 1, par: 4, strokes: 4, putts: 2, fairway: 'hit' };
    const round = { ...makeRound(), holes: numbers.map((number) => ({ ...hole, number })) };
    expect(validateRound(round)).toContainEqual(expect.objectContaining({ code: 'holes-order' }));
  });

  test.each([null, undefined, [], {}, 'hole', 1])('rejects malformed nested hole %s', (hole) => {
    const round = { ...makeRound(), holes: [hole] } as Round;
    const errors = validateRound(round);
    expect(errors).toHaveLength(6);
    expect(errors.every((error) => error.field === 'holes' && error.holeNumber === 1)).toBe(true);
  });

  test('validates sparse arrays and all holes rather than skipping invalid positions', () => {
    const holes = new Array<Hole>(2);
    expect(validateRound({ ...makeRound(), holes })).toHaveLength(12);
  });

  test('reports multiple bad hole fields and preserves input', () => {
    const holes = Object.freeze([{ number: 1, par: 2, strokes: 0, putts: 1, fairway: 'n/a' as const }]);
    const round = Object.freeze({ ...makeRound(), holes });
    expect(validateRound(round).map((error) => error.code)).toEqual([
      'par-range', 'strokes-range', 'putts-not-below-strokes',
    ]);
  });
});
