import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { InlineStatus } from '../kit';

/** Removal is reversible through the persistent global undo region. */
export function RemoveRound({ onRemove, disabledReason, pending = false }: {
  onRemove(): Promise<void>; disabledReason?: string; pending?: boolean;
}): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  async function remove(): Promise<void> {
    if (busy.current) return;
    busy.current = true; setWorking(true); setError(null);
    try { await onRemove(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The round could not be removed. Try again.'); }
    finally { busy.current = false; setWorking(false); }
  }
  return <div class="log-remove">
    <button disabled={Boolean(disabledReason) || pending || working} aria-describedby={disabledReason ? 'remove-reason' : undefined}
      onClick={() => { void remove(); }}>{working ? 'Removing…' : error ? 'Retry removing round' : 'Remove round'}</button>
    {disabledReason && <p id="remove-reason" class="kit-hint">{disabledReason}</p>}
    {error && <InlineStatus tone="error" message={error} />}
  </div>;
}
