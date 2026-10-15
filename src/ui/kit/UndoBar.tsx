import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { InlineStatus } from './InlineStatus';

/** Persistent undo actions. Unmounting never dismisses or deletes stored data. */
export function UndoBar(props: {
  message: string; pending: boolean; error?: string;
  onUndo(): Promise<void>; onDismiss(): Promise<void>;
}): JSX.Element {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();
  async function act(action: () => Promise<void>): Promise<void> {
    if (running.current || props.pending) return;
    running.current = true;
    setBusy(true);
    setFailure(undefined);
    try { await action(); }
    catch (error) { setFailure(error instanceof Error ? error.message : 'The action failed. Try again.'); }
    finally { running.current = false; setBusy(false); }
  }
  return <section class="kit-undo" aria-label="Pending round removal" aria-busy={props.pending || busy}>
    <p role="status">{props.message}</p>
    {(failure ?? props.error) && <InlineStatus tone="error" message={failure ?? props.error ?? ''} fixHint="Your removed round is still available. Retry Undo or Dismiss." />}
    <div class="kit-actions">
      <button type="button" disabled={props.pending || busy} onClick={() => { void act(props.onUndo); }}>Undo</button>
      <button type="button" disabled={props.pending || busy} onClick={() => { void act(props.onDismiss); }}>Dismiss</button>
    </div>
  </section>;
}
