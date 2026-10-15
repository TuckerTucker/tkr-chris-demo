import type { Hole } from './hole';
import { isFairwayEligible, isGreenInRegulation } from './hole-derivations';

/** Derived running or final statistics; null percentages have no denominator. */
export interface RoundTotals {
  readonly holesPlayed: number;
  readonly par: number;
  readonly strokes: number;
  readonly scoreToPar: number;
  readonly putts: number;
  readonly gir: number;
  readonly girPct: number | null;
  readonly fairwaysHit: number;
  readonly fairwaysEligible: number;
  readonly fairwayPct: number | null;
}

/** Recomputes all totals from validated hole records, never cached summaries. */
export function roundTotals(holes: readonly Hole[]): RoundTotals {
  let par = 0;
  let strokes = 0;
  let putts = 0;
  let gir = 0;
  let fairwaysHit = 0;
  let fairwaysEligible = 0;
  for (const hole of holes) {
    par += hole.par;
    strokes += hole.strokes;
    putts += hole.putts;
    if (isGreenInRegulation(hole)) gir += 1;
    if (isFairwayEligible(hole.par)) {
      fairwaysEligible += 1;
      if (hole.fairway === 'hit') fairwaysHit += 1;
    }
  }
  return {
    holesPlayed: holes.length, par, strokes, scoreToPar: strokes - par, putts, gir,
    girPct: holes.length === 0 ? null : Math.round(gir / holes.length * 100),
    fairwaysHit, fairwaysEligible,
    fairwayPct: fairwaysEligible === 0 ? null : Math.round(fairwaysHit / fairwaysEligible * 100),
  };
}
