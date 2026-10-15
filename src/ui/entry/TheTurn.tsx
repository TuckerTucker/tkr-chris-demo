import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useContainer } from '../../app/container';
import { navigate, resumePath } from '../../app/router';
import { InlineStatus } from '../kit';
import { HoleNav } from './HoleNav';
import { SessionStatus } from './SessionStatus';
import { useRoundCompletion } from './useRoundCompletion';
import { useRoundSession } from './useRoundSession';
import { AbandonRound } from './AbandonRound';

function CompletionScreen({ finish }: { finish: boolean }): JSX.Element {
  const c = useContainer();
  const session = useRoundSession(c);
  const completion = useRoundCompletion(session, c);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const round = session.round;
  const attemptedFinish = useRef(false);
  const drafts = Object.values({ ...round?.drafts, ...session.localDrafts }).filter((draft) => draft.number <= (round?.holes.length ?? 0));
  useEffect(() => {
    if (!finish || attemptedFinish.current || completion.step !== 'finish' || completion.pending || session.loading
      || completion.error || drafts.length) return;
    attemptedFinish.current = true;
    void completion.finish().catch(() => undefined);
  }, [finish, completion.step, completion.pending, completion.error, session.loading, drafts.length]);
  useEffect(() => {
    if (round && !completion.pending && !session.loading && !completion.error
      && completion.step !== (finish ? 'finish' : 'turn')) {
      void navigate(resumePath(round)).catch((failure: unknown) => setNavigationError(failure instanceof Error ? failure.message : 'Could not resume this round.'));
    }
  }, [round?.id, completion.step, completion.pending, completion.error, session.loading, finish]);
  async function open(path: string): Promise<void> {
    try { await navigate(path); setNavigationError(null); }
    catch (failure) { setNavigationError(failure instanceof Error ? failure.message : 'Could not open this scorecard.'); }
  }
  if (!round || completion.step !== (finish ? 'finish' : 'turn')) return <section><h2>{round?.status === 'finished' ? 'Your round is complete' : 'Keep your round going'}</h2>
    <p>{round ? 'Return to the current place in your scorecard.' : 'Start a round to begin recording holes.'}</p>
    {navigationError && <InlineStatus tone="error" message={navigationError} />}
    <button onClick={() => { void open(round ? resumePath(round) : '/round/start'); }}>{round ? 'Open scorecard' : 'Start a round'}</button></section>;
  const totals = session.totals;
  const blocked = completion.pending || drafts.length > 0 || Boolean(session.error && session.error.kind !== 'invalid');
  return <section class="entry-page entry-completion"><p class="entry-eyebrow">{finish ? 'Eighteen holes recorded' : 'Front nine complete'}</p>
    <h2>{finish ? 'Finish your round.' : 'The turn.'}</h2>
    <div class="entry-headline"><p class="entry-eyebrow">{finish ? 'Round' : 'Front nine'} to par</p>
      <strong>{totals.scoreToPar > 0 ? '+' : ''}{totals.scoreToPar === 0 ? 'E' : totals.scoreToPar}</strong></div>
    <dl class="entry-stat-list"><div><dt>Strokes</dt><dd>{totals.strokes}</dd></div><div><dt>Putts</dt><dd>{totals.putts}</dd></div>
      <div><dt>Greens in regulation</dt><dd>{totals.gir} / {totals.holesPlayed}</dd></div>
      <div><dt>Fairways hit</dt><dd>{totals.fairwaysEligible ? `${totals.fairwaysHit} / ${totals.fairwaysEligible}` : 'n/a'}</dd></div></dl>
    {drafts.length > 0 && <section aria-label="Unfinished corrections"><InlineStatus tone="warning" message="Some corrections are still drafts."
      fixHint="Confirm or discard each correction before finishing this round." />
      <div class="kit-actions">{drafts.map((draft) => <button key={draft.number} onClick={() => { void open(`/round/hole/${draft.number}`); }}>
        Review correction to hole {draft.number}</button>)}</div></section>}
    <details class="entry-review"><summary>Review recorded holes</summary><HoleNav recorded={round.holes.length} current={0} onSelect={session.goTo} /></details>
    <SessionStatus controller={c.session} onRecovered={async () => {
      const updated = c.session.getSnapshot().round;
      if (updated && (updated.status === 'finished' || updated.continuedTo18 && !finish)) await open(resumePath(updated));
    }} />
    {completion.error && completion.error !== session.error && <InlineStatus tone="error" message={completion.error.message} fixHint={completion.error.fixHint} />}
    {navigationError && <InlineStatus tone="error" message={navigationError} />}
    <div class="entry-actions">
      {!finish && <button class="entry-choice" disabled={blocked} onClick={(event) => { if (event.detail <= 1) void completion.continueToTen().catch(() => undefined); }}>Play the back nine</button>}
      <button class={finish ? 'entry-primary' : 'entry-choice'} disabled={blocked}
        onClick={(event) => { if (event.detail <= 1) void (finish ? completion.finish() : completion.finishAtNine()).catch(() => undefined); }}>
        {completion.pending ? 'Saving…' : finish ? 'Finish — 18 holes' : 'Finish — 9 holes'}</button>
      {drafts.length > 0 && <p class="kit-hint">Review your unfinished corrections above to continue.</p>}
    </div>
    <details class="entry-review"><summary>Round options</summary><AbandonRound onAbandon={completion.abandon} onRestore={completion.restore} /></details>
  </section>;
}

/** The golfer chooses nine or eighteen; neither option is preselected. */
export function TheTurn(): JSX.Element { return <CompletionScreen finish={false} />; }

/** Attempt finalisation once; durable hole eighteen remains recoverable if that transaction fails. */
export function FinishRound(): JSX.Element { return <CompletionScreen finish />; }
