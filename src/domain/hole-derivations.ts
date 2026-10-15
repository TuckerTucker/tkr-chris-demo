import type { Hole } from './hole';

/** Computes GIR from a validated hole, including fewer-than-regulation approach shots. */
export function isGreenInRegulation(hole: Pick<Hole, 'par' | 'strokes' | 'putts'>): boolean {
  return hole.strokes - hole.putts <= hole.par - 2;
}

/** Only par-four and par-five holes contribute to fairway statistics. */
export function isFairwayEligible(par: number): boolean {
  return par === 4 || par === 5;
}

/** Computes strokes over or under par from a validated hole. */
export function scoreToPar(hole: Pick<Hole, 'par' | 'strokes'>): number {
  return hole.strokes - hole.par;
}
