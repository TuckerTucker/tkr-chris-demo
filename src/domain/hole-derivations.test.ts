import { expect, test } from 'vitest';
import { isFairwayEligible, isGreenInRegulation, scoreToPar } from './index';

test.each([3, 4, 5])('GIR boundary for par %s', (par) => {
  expect(isGreenInRegulation({ par, strokes: par, putts: 2 })).toBe(true);
  expect(isGreenInRegulation({ par, strokes: par + 1, putts: 2 })).toBe(false);
  expect(isGreenInRegulation({ par, strokes: par - 1, putts: 2 })).toBe(true);
});

test.each([[3, false], [4, true], [5, true], [2, false], [6, false]] as const)(
  'par %s fairway eligibility is %s', (par, eligible) => {
    expect(isFairwayEligible(par)).toBe(eligible);
  },
);

test.each([[3, 1, -2], [4, 4, 0], [5, 7, 2]])('par %s, strokes %s score is %s', (par, strokes, expected) => {
  expect(scoreToPar({ par, strokes })).toBe(expected);
});
