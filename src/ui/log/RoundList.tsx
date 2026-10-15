import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { useContainer } from '../../app/container';
import { useSnapshot } from '../../app/hooks';
import { navigate, resumePath } from '../../app/router';
import { nextStep } from '../../domain';
import { InlineStatus } from '../kit';
import { roundDate, RoundStats, scoreLabel } from './presentation';
import { useRoundList } from './useRoundList';
import './log.css';

/** Unpaginated local history with an explicit active-round and persistent-undo boundary. */
export function RoundList(): JSX.Element {
  const c = useContainer();
  const list = useRoundList(c);
  const undo = useSnapshot(c.undo);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  async function go(path: string): Promise<void> {
    try { await navigate(path); setNavigationError(null); }
    catch (error) { setNavigationError(error instanceof Error ? error.message : 'Save your changes before leaving.'); }
  }
  const active = list.inProgress;
  const newReason = active ? 'Round in progress' : undo.item?.round.status === 'in-progress'
    ? 'Undo or dismiss your abandoned round first' : list.loading ? 'Checking saved rounds…' : list.error ? 'Reload your rounds before starting' : null;
  const empty = !list.loading && !list.error && !active && list.finished.length === 0;
  const step = active ? nextStep(active.round) : null;
  const progress = active ? active.round.activeHole !== null && Object.hasOwn(active.round.drafts, active.round.activeHole)
    ? `Editing hole ${String(active.round.activeHole).padStart(2, '0')}`
    : step === 'turn' ? 'At the turn' : step === 'finish' ? 'Ready to finish'
      : `Hole ${String(active.round.holes.length + 1).padStart(2, '0')}${active.round.continuedTo18 ? ' of 18' : ''}` : '';
  return <section class="round-log" aria-labelledby="rounds-heading">
    <header class="log-heading"><h2 id="rounds-heading">Rounds</h2><div>
      <button disabled={newReason !== null} aria-describedby={newReason ? 'new-round-reason' : undefined}
        onClick={() => { void go('/round/start'); }}>New round</button>
      {newReason && <p id="new-round-reason" class="kit-hint">{newReason}</p>}
    </div></header>
    {list.loading && <p role="status">Loading scorecards…</p>}
    {list.error && <div><InlineStatus tone="error" message={list.error.message} fixHint={list.error.fixHint} />
      <button onClick={() => { void list.reload(); }}>Retry loading rounds</button></div>}
    {navigationError && <InlineStatus tone="error" message={navigationError} />}
    {active && <article class="log-active" aria-label="Round in progress">
      <div><p class="log-eyebrow">In progress · {roundDate(active.round.date)}</p><h3>{progress}</h3>
        <p><strong class="log-score" aria-label={`${active.totals.scoreToPar === 0 ? 'Even' : scoreLabel(active.totals.scoreToPar)} to par`}>{scoreLabel(active.totals.scoreToPar)}</strong> <span class="kit-hint">to par</span></p></div>
      <button class="log-resume" onClick={() => { void go(resumePath(active.round)); }}>Resume</button>
    </article>}
    {empty && <div class="log-empty"><p class="log-eyebrow">No rounds yet</p><h3>Your scorecards will appear here</h3>
      <p>Record a round hole by hole. Every finished round lands in this log.</p>
      <button class="log-primary" disabled={newReason !== null} onClick={() => { void go('/round/start'); }}>Start your first round</button>
    </div>}
    {list.finished.length > 0 && <ol class="log-rounds" aria-label="Finished rounds">{list.finished.map(({ round, totals }, index) =>
      <li key={round.id}><article class="log-round" aria-label={`${roundDate(round.date)}, ${round.holes.length} holes`}>
        <span class="log-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <div class="log-round-content"><h3><a href={`#/log/${round.id}`} onClick={(event) => { event.preventDefault(); void go(`/log/${round.id}`); }}>{roundDate(round.date)}</a></h3><p class="log-eyebrow">{round.holes.length} holes</p>
          <RoundStats totals={totals} compact /></div>
        <strong class="log-score" aria-label={`${totals.scoreToPar === 0 ? 'Even' : scoreLabel(totals.scoreToPar)} to par`}>{scoreLabel(totals.scoreToPar)}</strong>
      </article></li>)}</ol>}
  </section>;
}
