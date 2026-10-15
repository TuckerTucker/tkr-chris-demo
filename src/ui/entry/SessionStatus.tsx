import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { SessionController } from '../../app/session';
import { useSnapshot } from '../../app/hooks';
import type { HoleDraft } from '../../domain';
import { InlineStatus } from '../kit';

function describe(draft: HoleDraft | undefined): string {
  return draft ? `Par ${draft.par} · ${draft.strokes} strokes · ${draft.putts} putts · fairway ${draft.fairway ?? 'unanswered'}` : 'No hole recorded';
}

/** Shared save feedback and explicit current/local conflict comparison for every editor. */
export function SessionStatus({ controller, onRecovered }: {
  controller: SessionController; onRecovered?(): Promise<void>;
}): JSX.Element {
  const state = useSnapshot(controller);
  const [actionError, setActionError] = useState<string | null>(null);
  async function run(action: () => Promise<void>): Promise<void> {
    try { await action(); setActionError(null); await onRecovered?.(); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'The change could not be saved. Try again.'); }
  }
  return <div class="entry-save-status" aria-label="Save status">
    <p role="status">{state.saveState === 'saving' ? 'Saving…' : state.saveState === 'error' ? 'Not saved' : 'Saved on this device'}</p>
    {state.error && <InlineStatus tone="error" message={state.error.message} fixHint={state.error.fixHint} />}
    {state.error?.kind === 'conflict' ? <section class="entry-conflict" aria-label="Review conflicting edits">
      <h3>Review both versions</h3>
      {Object.values(state.localDrafts).map((draft) => <div key={draft.number}>
        <h4>Hole {draft.number}</h4><p><strong>Your edits:</strong> {describe(draft)}</p>
        <p><strong>Saved version:</strong> {describe(state.conflictRound?.drafts[draft.number]
          ?? state.conflictRound?.holes.find((hole) => hole.number === draft.number))}</p></div>)}
      {!state.conflictRound && <p>This round is no longer available. Your edits are shown above.</p>}
      <div class="kit-actions"><button disabled={state.pending} onClick={() => { void run(() => controller.resolveConflict('reload')); }}>Use saved version</button>
        <button disabled={state.pending || !state.conflictRound} onClick={() => { void run(() => controller.resolveConflict('reapply')); }}>Reapply my edits</button></div>
      <p class="kit-hint">Reapplying restores your draft. Review it and confirm the hole to change its score.</p>
    </section> : state.error && <button disabled={state.pending} onClick={() => { void run(() => controller.retry()); }}>Retry saving</button>}
    {actionError && actionError !== state.error?.message && <InlineStatus tone="error" message={actionError} />}
  </div>;
}
