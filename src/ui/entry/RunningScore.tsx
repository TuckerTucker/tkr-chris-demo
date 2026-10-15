import type { JSX } from 'preact';
import type { RoundTotals } from '../../domain';

/** Compact on-course context; draft inputs never enter the running score. */
export function RunningScore({ totals, holeNumber, par }: { totals: RoundTotals; holeNumber: number; par: number }): JSX.Element {
  return <header class="entry-score"><div><p class="entry-eyebrow">Par {par}</p><h2>Hole {String(holeNumber).padStart(2, '0')}</h2></div>
    <div class="entry-score-value"><strong>{totals.scoreToPar > 0 ? '+' : ''}{totals.scoreToPar === 0 ? 'E' : totals.scoreToPar}</strong>
      <p class="entry-eyebrow">To par · {totals.holesPlayed} {totals.holesPlayed === 1 ? 'hole' : 'holes'} recorded</p></div></header>;
}
