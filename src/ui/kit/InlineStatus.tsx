import type { JSX } from 'preact';

/** A stable in-place live region; unchanged messages are not remounted on keystrokes. */
export function InlineStatus(props: {
  tone: 'error' | 'warning' | 'info'; message: string; fixHint?: string;
}): JSX.Element {
  return <div class="kit-status" data-tone={props.tone} role="status" aria-live="polite" aria-atomic="true">
    <span class="kit-status-dot" aria-hidden="true" />
    <div><p>{props.message}</p>{props.fixHint && <p class="kit-status-hint">{props.fixHint}</p>}</div>
  </div>;
}
