import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { useContainer } from '../../app/container';
import { useSnapshot } from '../../app/hooks';
import { navigate, resumePath } from '../../app/router';
import { InlineStatus } from '../kit';
import { SessionStatus } from './SessionStatus';
import { useRoundSession } from './useRoundSession';

/** Start with today's local date, or resume the existing round without duplication. */
export function StartRound(): JSX.Element {
  const c = useContainer();
  const session = useRoundSession(c);
  const undo = useSnapshot(c.undo);
  const [error, setError] = useState<string | null>(null);
  const abandoned = undo.item?.round.status === 'in-progress';
  const active = session.round?.status === 'in-progress' ? session.round : null;
  const busy = session.pending || session.loading || undo.pending;
  async function start(): Promise<void> {
    try {
      if (c.session.getSnapshot().round?.status !== 'in-progress') await session.start();
      const round = c.session.getSnapshot().round;
      if (round) await navigate(resumePath(round));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The round could not be started. Retry below.'); }
  }
  const date = new Date(`${c.today()}T12:00:00`);
  return <section class="entry-page entry-start"><p class="entry-eyebrow">Your next round</p><h2>Make every<br />hole count.</h2>
    <p class="entry-date">{date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
    <p class="entry-intro">Nine holes or eighteen.<br />Your scorecard, one hole at a time.</p>
    <p class="kit-hint">Your changes save on this device as you play.</p>
    {abandoned && <InlineStatus tone="info" message="Your abandoned round is waiting." fixHint="Use Undo above to return to it, or Dismiss before starting another round." />}
    {active && <p>You have {active.holes.length} holes recorded. Pick up where you left off.</p>}
    <div class="entry-actions">
      {error && <InlineStatus tone="error" message={error} />}
      {session.error && <SessionStatus controller={c.session} onRecovered={start} />}
      <button class="entry-primary" disabled={busy || abandoned} onClick={(event) => { if (event.detail <= 1) void start(); }}>
        {busy ? 'Opening round…' : active ? 'Resume round' : 'Start round'}</button>
      <button onClick={() => { void navigate('/log').catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Could not open the log.')); }}>View round log</button>
    </div></section>;
}
