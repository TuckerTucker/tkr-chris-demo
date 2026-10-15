import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useContainer } from '../../app/container';
import { navigate, resumePath } from '../../app/router';
import { roundTotals } from '../../domain';
import { toStorageError } from '../../storage';
import type { StorageError, StoredRound } from '../../storage';
import { InlineStatus, ScorecardTable } from '../kit';

/** Reads the committed finished round independently from the active editing session. */
export function RoundSummary({ params }: { params: { id: string } }): JSX.Element {
  const c = useContainer();
  const [round, setRound] = useState<StoredRound | null>(null);
  const [error, setError] = useState<StorageError | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function read(): Promise<void> {
      try { const value = await c.repository.getRound(params.id); if (active) { setRound(value); setError(null); } }
      catch (failure) { if (active) setError(toStorageError(failure)); }
    }
    void read(); const unsubscribe = c.subscribe(() => { void read(); });
    return () => { active = false; unsubscribe(); };
  }, [c, params.id, attempt]);
  async function open(path: string): Promise<void> {
    try { await navigate(path); } catch (failure) { setError(toStorageError(failure)); }
  }
  if (error && !round) return <section><h2>{error.kind === 'not-found' ? 'Round not found' : 'Could not open this round'}</h2>
    <InlineStatus tone="error" message={error.message} fixHint={error.fixHint} />
    {error.kind !== 'not-found' && <button onClick={() => setAttempt((value) => value + 1)}>Retry opening round</button>}
    <button onClick={() => { void open('/log'); }}>Go to round log</button></section>;
  if (!round) return <p role="status">Opening your round…</p>;
  if (round.status !== 'finished') return <section><h2>This round is still in progress</h2><p>Finish it before opening its final summary.</p>
    <button onClick={() => { void open(resumePath(round)); }}>Resume round</button></section>;
  const total = roundTotals(round.holes);
  const eighteen = round.holes.length === 18;
  return <section class="entry-page entry-summary"><p class="entry-eyebrow">{round.date} · {total.holesPlayed} holes</p><h2>Round complete.</h2>
    <div class="entry-headline"><p class="entry-eyebrow">To par</p><strong>{total.scoreToPar > 0 ? '+' : ''}{total.scoreToPar === 0 ? 'E' : total.scoreToPar}</strong></div>
    <dl class="entry-stat-grid"><div><dt>Strokes</dt><dd>{total.strokes}</dd></div><div><dt>Putts</dt><dd>{total.putts}</dd></div>
      <div><dt>GIR</dt><dd>{total.girPct === null ? 'n/a' : `${total.girPct}%`}</dd></div>
      <div><dt>Fairways</dt><dd>{total.fairwaysEligible ? `${total.fairwaysHit}/${total.fairwaysEligible}` : 'n/a'}</dd></div></dl>
    <ScorecardTable holes={round.holes} showBackNine={showBack} totals={{ total,
      ...(eighteen ? { out: roundTotals(round.holes.slice(0, 9)), in: roundTotals(round.holes.slice(9)) } : {}) }} />
    {eighteen && <button class="entry-expand" aria-expanded={showBack} onClick={() => setShowBack((value) => !value)}>{showBack ? 'Hide holes 10–18' : 'Show holes 10–18'}</button>}
    {error && <InlineStatus tone="error" message={error.message} fixHint={error.fixHint} />}
    <div class="entry-actions"><button class="entry-primary" onClick={() => { void open('/log'); }}>Go to round log</button>
      <button onClick={() => { void open('/round/start'); }}>Start another round</button></div>
  </section>;
}
