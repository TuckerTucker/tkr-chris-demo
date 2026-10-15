import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { InlineStatus } from '../kit';

/** Nonmodal abandonment delegates persistent undo to the app-level controller. */
export function AbandonRound({ onAbandon, onRestore }: { onAbandon(): Promise<void>; onRestore(): Promise<void> }): JSX.Element {
  const [pending, setPending] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  async function act(restore: boolean): Promise<void> {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(null);
    try { await (restore ? onRestore() : onAbandon()); setRemoved(!restore); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'This action could not be saved. Retry below.'); }
    finally { busy.current = false; setPending(false); }
  }
  return <div class="entry-abandon"><p class="kit-hint">Leave this round. You can undo this from the round log, even after reopening the app.</p>
    {error && <InlineStatus tone="error" message={error} fixHint="Your round is retained. Retry the action below." />}
    <button disabled={pending} onClick={(event) => { if (event.detail <= 1) void act(removed); }}>
      {pending ? 'Saving…' : removed ? 'Undo abandon' : 'Abandon round'}</button></div>;
}
