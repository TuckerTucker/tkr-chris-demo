import type { JSX } from 'preact';
import type { RoundTotals } from '../../domain';

/** Parse a calendar date in local time, avoiding midnight UTC offsets. */
export function roundDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${value}T12:00:00`));
}

/** Familiar compact golf score with an explicit accessible description at its call site. */
export function scoreLabel(value: number): string { return value === 0 ? 'E' : value > 0 ? `+${value}` : String(value); }

/** Confirmed score statistics shared by history and detail. */
export function RoundStats({ totals, compact = false }: { totals: RoundTotals; compact?: boolean }): JSX.Element {
  return <dl class={compact ? 'log-stats log-stats--compact' : 'log-stats'}>
    <div><dt>Strokes</dt><dd>{totals.strokes}</dd></div>
    <div><dt>Putts</dt><dd>{totals.putts}</dd></div>
    <div><dt>GIR</dt><dd>{totals.girPct === null ? 'n/a' : `${totals.girPct}%`}</dd></div>
    <div><dt>Fairways</dt><dd>{totals.fairwaysEligible ? `${totals.fairwaysHit}/${totals.fairwaysEligible}` : 'n/a'}</dd></div>
  </dl>;
}
