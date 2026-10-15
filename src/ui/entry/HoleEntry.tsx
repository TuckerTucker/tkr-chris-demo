import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useContainer } from '../../app/container';
import { navigate, resumePath } from '../../app/router';
import { nextStep } from '../../domain';
import type { HoleDraft } from '../../domain';
import { InlineStatus } from '../kit';
import { HoleEditor } from './HoleEditor';
import { HoleNav } from './HoleNav';
import { RunningScore } from './RunningScore';
import { SessionStatus } from './SessionStatus';
import { useHoleEditor } from './useHoleEditor';
import { useRoundSession } from './useRoundSession';
import type { RoundSession } from './useRoundSession';
import { useRoundCompletion } from './useRoundCompletion';
import { AbandonRound } from './AbandonRound';

function EntryForm({ number, initial, suggestedPar, session }: {
  number: number; initial?: HoleDraft; suggestedPar: number; session: RoundSession;
}): JSX.Element {
  const c = useContainer();
  const completion = useRoundCompletion(session, c);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editor = useHoleEditor({ holeNumber: number, initial, suggestedPar,
    onDraftChange: (draft) => { void session.saveDraft(draft).catch(() => undefined); } });
  const correction = number <= (session.round?.holes.length ?? 0);
  async function resume(): Promise<void> {
    const round = c.session.getSnapshot().round;
    if (round && !round.drafts[number] && !c.session.getSnapshot().localDrafts[number]
      && round.holes.some((hole) => hole.number === number)) await navigate(resumePath(round));
  }
  async function confirm(): Promise<void> {
    if (committing) return;
    setCommitting(true); setError(null);
    try { await (correction ? session.correct(editor.toHole()) : session.save(editor.toHole())); await resume(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'This hole could not be saved. Your edits are retained.'); }
    finally { setCommitting(false); }
  }
  async function discard(): Promise<void> {
    try { await c.session.discardDraft(number); await resume(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not discard this edit.'); }
  }
  const blocked = committing || !editor.canSave || session.loading || Boolean(session.error && session.error.kind !== 'invalid');
  return <>
    <RunningScore totals={session.totals} holeNumber={number} par={editor.draft.par} />
    <HoleNav recorded={session.round?.holes.length ?? 0} current={number}
      availableNext={session.round && nextStep(session.round) === 'enter-hole' ? session.round.holes.length + 1 : undefined} onSelect={session.goTo} />
    {correction && <p class="entry-eyebrow">Correcting a recorded hole · totals change on confirmation</p>}
    <fieldset class="entry-fields" disabled={committing}><legend class="sr-only">Hole {number} inputs</legend>
      <HoleEditor editor={editor} layout="full" /></fieldset>
    <SessionStatus controller={c.session} onRecovered={async () => { setError(null); await resume(); }} />
    <div class="entry-actions">
      {error && error !== session.error?.message && <InlineStatus tone="error" message={error} />}
      {!editor.canSave && <p class="kit-hint" id="confirm-reason">{editor.errors[0]?.message}</p>}
      <button class="entry-primary" disabled={blocked} aria-describedby={!editor.canSave ? 'confirm-reason' : undefined}
        onClick={(event) => { if (event.detail <= 1) void confirm(); }}>{committing ? 'Confirming…' : correction ? `Save correction to hole ${number}` : `Confirm hole ${number}`}</button>
      {correction && <button disabled={committing || session.pending} onClick={() => { void discard(); }}>Discard correction</button>}
    </div>
    <details class="entry-review"><summary>Round options</summary><AbandonRound onAbandon={completion.abandon} onRestore={completion.restore} /></details>
  </>;
}

function PreparedEntry({ number, session }: { number: number; session: RoundSession }): JSX.Element {
  const c = useContainer();
  const initial = session.localDrafts[number] ?? session.round?.drafts[number] ?? session.round?.holes.find((hole) => hole.number === number);
  const [suggestion, setSuggestion] = useState<number | null>(initial?.par ?? null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (initial) return;
    let active = true;
    void c.parSource.suggestPar(number).then((par) => { if (active) { setSuggestion(par); setError(null); } },
      (failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : 'Could not load the previous par.'); });
    return () => { active = false; };
  }, [c, number, attempt]);
  if (suggestion === null) return <section><h2>Hole {String(number).padStart(2, '0')}</h2>
    {error ? <><InlineStatus tone="error" message={error} fixHint="Retry to load the saved par for this hole." />
      <button onClick={() => setAttempt((value) => value + 1)}>Retry par suggestion</button></> : <p role="status">Preparing your next hole…</p>}</section>;
  return <EntryForm number={number} initial={initial} suggestedPar={suggestion} session={session} />;
}

/** Canonical hole entry uses saved drafts before defaults and preserves edits across route changes. */
export function HoleEntry({ params }: { params: { n: string } }): JSX.Element {
  const c = useContainer();
  const session = useRoundSession(c);
  const [error, setError] = useState<string | null>(null);
  const round = session.round;
  const number = /^\d+$/.test(params.n) ? Number(params.n) : NaN;
  const valid = round && round.status === 'in-progress' && Number.isSafeInteger(number) && number >= 1 && number <= 18
    && (number <= round.holes.length || (number === round.holes.length + 1 && nextStep(round) === 'enter-hole'));
  if (session.loading && !round) return <p role="status">Opening your round…</p>;
  if (!valid || !round) return <section><h2>This hole is not available</h2><p>Return to your current scorecard to continue.</p>
    {error && <InlineStatus tone="error" message={error} />}
    <SessionStatus controller={c.session} />
    <button onClick={() => { void navigate(round ? resumePath(round) : '/round/start').catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Could not open this round.')); }}>
      {round ? 'Resume round' : 'Start a round'}</button></section>;
  return <section class="entry-page"><PreparedEntry key={`${round.id}:${number}:${session.editorVersion}`} number={number} session={session} /></section>;
}
