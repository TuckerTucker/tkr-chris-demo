import { expect, test } from 'vitest';
import { roundTotals, validateHole } from './index';
import type { Hole, RoundTotals } from './index';

// Independently tallied front nine: par 36, 39 strokes, 16 putts, 4 GIR, 4/7 fairways.
const front: readonly Hole[] = [
  { number: 1, par: 4, strokes: 4, putts: 2, fairway: 'hit' },
  { number: 2, par: 3, strokes: 3, putts: 2, fairway: 'n/a' },
  { number: 3, par: 5, strokes: 6, putts: 2, fairway: 'missed' },
  { number: 4, par: 4, strokes: 5, putts: 2, fairway: 'hit' },
  { number: 5, par: 4, strokes: 3, putts: 1, fairway: 'hit' },
  { number: 6, par: 3, strokes: 4, putts: 2, fairway: 'n/a' },
  { number: 7, par: 5, strokes: 5, putts: 2, fairway: 'missed' },
  { number: 8, par: 4, strokes: 4, putts: 1, fairway: 'hit' },
  { number: 9, par: 4, strokes: 5, putts: 2, fairway: 'missed' },
];
// Back nine: par 36, 35 strokes, 16 putts, 7 GIR, 4/7 fairways.
const back: readonly Hole[] = [
  { number: 10, par: 4, strokes: 4, putts: 2, fairway: 'missed' },
  { number: 11, par: 5, strokes: 4, putts: 1, fairway: 'hit' },
  { number: 12, par: 3, strokes: 1, putts: 0, fairway: 'n/a' },
  { number: 13, par: 4, strokes: 5, putts: 3, fairway: 'hit' },
  { number: 14, par: 4, strokes: 4, putts: 2, fairway: 'missed' },
  { number: 15, par: 5, strokes: 6, putts: 2, fairway: 'missed' },
  { number: 16, par: 3, strokes: 3, putts: 1, fairway: 'n/a' },
  { number: 17, par: 4, strokes: 4, putts: 2, fairway: 'hit' },
  { number: 18, par: 4, strokes: 4, putts: 3, fairway: 'hit' },
];

test('nine-hole totals match independent tally', () => {
  expect(front.flatMap(validateHole)).toEqual([]);
  expect(roundTotals(front)).toEqual({
    holesPlayed: 9, par: 36, strokes: 39, scoreToPar: 3, putts: 16,
    gir: 4, girPct: 44, fairwaysHit: 4, fairwaysEligible: 7, fairwayPct: 57,
  } satisfies RoundTotals);
});

test('eighteen-hole totals match independent tally', () => {
  const holes = [...front, ...back];
  expect(holes.flatMap(validateHole)).toEqual([]);
  expect(roundTotals(holes)).toEqual({
    holesPlayed: 18, par: 72, strokes: 74, scoreToPar: 2, putts: 32,
    gir: 11, girPct: 61, fairwaysHit: 8, fairwaysEligible: 14, fairwayPct: 57,
  } satisfies RoundTotals);
});

test('empty totals have null percentages', () => {
  expect(roundTotals([])).toEqual({
    holesPlayed: 0, par: 0, strokes: 0, scoreToPar: 0, putts: 0,
    gir: 0, girPct: null, fairwaysHit: 0, fairwaysEligible: 0, fairwayPct: null,
  } satisfies RoundTotals);
});

test('par threes do not enter the fairway denominator', () => {
  const holes: readonly Hole[] = [
    { number: 1, par: 3, strokes: 1, putts: 0, fairway: 'n/a' },
    { number: 2, par: 3, strokes: 4, putts: 2, fairway: 'n/a' },
    { number: 3, par: 3, strokes: 3, putts: 2, fairway: 'n/a' },
  ];
  expect(holes.flatMap(validateHole)).toEqual([]);
  expect(roundTotals(holes)).toEqual({
    holesPlayed: 3, par: 9, strokes: 8, scoreToPar: -1, putts: 4,
    gir: 2, girPct: 67, fairwaysHit: 0, fairwaysEligible: 0, fairwayPct: null,
  } satisfies RoundTotals);
});

test('corrections update every affected total, including switching par-three eligibility', () => {
  const initial = Object.freeze([{ number: 1, par: 4, strokes: 5, putts: 1, fairway: 'hit' as const }]);
  const corrected: readonly Hole[] = [{ number: 1, par: 3, strokes: 3, putts: 2, fairway: 'n/a' }];
  expect(roundTotals(initial)).toEqual({
    holesPlayed: 1, par: 4, strokes: 5, scoreToPar: 1, putts: 1,
    gir: 0, girPct: 0, fairwaysHit: 1, fairwaysEligible: 1, fairwayPct: 100,
  } satisfies RoundTotals);
  expect(roundTotals(corrected)).toEqual({
    holesPlayed: 1, par: 3, strokes: 3, scoreToPar: 0, putts: 2,
    gir: 1, girPct: 100, fairwaysHit: 0, fairwaysEligible: 0, fairwayPct: null,
  } satisfies RoundTotals);
  expect(roundTotals([{ ...corrected[0] as Hole, par: 5, fairway: 'missed' }])).toMatchObject({
    par: 5, scoreToPar: -2, fairwaysHit: 0, fairwaysEligible: 1, fairwayPct: 0,
  });
});
