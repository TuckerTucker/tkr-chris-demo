import type { JSX } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { useContainer } from '../../app/container';
import { useSnapshot } from '../../app/hooks';
import type { HoleDraft } from '../../domain';
import { HoleEditor, SessionStatus, useHoleEditor } from '../entry';
import { InlineStatus, ScorecardTable } from '../kit';
import { roundDate, RoundStats, scoreLabel } from './presentation';
import { RemoveRound } from './RemoveRound';
import { useRoundDetail } from './useRoundDetail';
import type { RoundDetailState } from './useRoundDetail';
import './log.css';

function Correction({ detail, initial }: { detail: RoundDetailState; initial: HoleDraft }): JSX.Element {
  const editor = useHoleEditor({ holeNumber: initial.number, initial, suggestedPar: initial.par,
    onDraftChange: (draft) => { void detail.saveDraft(draft).catch(() => undefined); } });
  const disabled = detail.pending || detail.removed;
  return <div class="log-correction">
    <h3 tabIndex={-1} data-correction-heading>Correct hole {String(initial.number).padStart(2, '0')}</h3>
    <fieldset disabled={disabled}><legend class="sr-only">Hole correction</legend><HoleEditor editor={editor} layout="compact" /></fieldset>
    <div class="kit-actions">
      <button class="log-primary" disabled={disabled || !editor.canSave || detail.snapshot.pending || Boolean(detail.snapshot.error)}
        onClick={() => { void detail.saveHole(editor.toHole()).catch(() => undefined); }}>Save correction</button>
      <button disabled={disabled || detail.snapshot.pending || Boolean(detail.snapshot.error && detail.snapshot.error.kind !== 'invalid')}
        onClick={() => { void detail.cancel().catch(() => undefined); }}>Cancel correction</button>
    </div>
    <p class="kit-hint">Draft saved automatically. Totals change when you save the correction.</p>
  </div>;
}

/** The saved card remains readable while one hole is corrected in place. */
export function RoundDetail({ params }: { params: { id: string } }): JSX.Element {
  const c = useContainer();
  const detail = useRoundDetail(c, params.id);
  const undo = useSnapshot(c.undo);
  const section = useRef<HTMLElement>(null);
  const previousEditor = useRef<number | null>(null);
  const previousVersion = useRef(-1);
  useLayoutEffect(() => {
    if (detail.pending || (previousEditor.current === detail.editing && previousVersion.current === detail.snapshot.editorVersion)) return;
    if (detail.editing !== null) {
      const scroll = section.current?.querySelector<HTMLElement>('.kit-scorecard-scroll');
      if (scroll) scroll.scrollLeft = 0;
      section.current?.querySelector<HTMLElement>('[data-correction-heading]')?.focus();
    }
    else if (previousEditor.current !== null) {
      section.current?.querySelector<HTMLButtonElement>(`button[aria-label="Edit hole ${previousEditor.current}"]`)?.focus();
    }
    previousEditor.current = detail.editing;
    previousVersion.current = detail.snapshot.editorVersion;
  }, [detail.editing, detail.snapshot.editorVersion, detail.pending]);
  const { round, totals } = detail;
  return <section ref={section} class="round-detail" aria-labelledby="detail-heading">
    <button class="log-back" onClick={() => { void detail.openLog().catch(() => undefined); }}>Back to rounds</button>
    <header class="log-detail-heading"><div><p class="log-eyebrow">{round ? `${round.holes.length} holes · ${round.status === 'finished' ? 'Finished round' : 'In progress'}` : 'Scorecard'}</p>
      <h2 id="detail-heading">{round ? roundDate(round.date) : detail.loading ? 'Loading round…' : 'Round unavailable'}</h2></div>
      {totals && <div><strong class="log-score">{scoreLabel(totals.scoreToPar)}</strong><p class="kit-hint">to par</p></div>}
    </header>
    {detail.loading && round && <p role="status">Loading scorecard…</p>}
    {detail.removed ? <div><InlineStatus tone="info" message="Round removed. Undo remains available until you dismiss it." />
      <button onClick={() => { void detail.openLog().catch(() => undefined); }}>Open rounds</button></div>
      : round || detail.snapshot.error ? <SessionStatus controller={detail.controller} onRecovered={detail.recovered} /> : <p role="status">Loading scorecard…</p>}
    {detail.error && detail.error !== detail.snapshot.error && <InlineStatus tone="error" message={detail.error.message} fixHint={detail.error.fixHint} />}
    {round && totals && <>
      <RoundStats totals={totals} />
      <ScorecardTable holes={round.holes} totals={{ total: totals }}
        onHoleSelect={detail.edit} selectionDisabled={detail.pending || detail.removed} selectedHole={detail.editing ?? undefined}
        renderEditor={(number) => {
          if (detail.removed) return null;
          const initial = detail.snapshot.localDrafts[number] ?? round.drafts[number] ?? round.holes.find((hole) => hole.number === number);
          return initial ? <Correction key={`${number}:${detail.snapshot.editorVersion}`} detail={detail} initial={initial} /> : null;
        }} />
      {!detail.removed && <RemoveRound onRemove={detail.remove} pending={detail.pending}
        disabledReason={undo.item ? 'Undo or dismiss the removed round before removing another.' : undefined} />}
    </>}
  </section>;
}
