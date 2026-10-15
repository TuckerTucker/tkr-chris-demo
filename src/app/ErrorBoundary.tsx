import { Component } from 'preact';
import type { ComponentChildren, JSX } from 'preact';
import { StorageError } from '../storage';
import { InlineStatus } from '../ui/kit';
import type { Logger } from './logger';

/** Keep render failures visible without resetting browser data. */
export class ErrorBoundary extends Component<{ children: ComponentChildren; logger: Logger }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } { return { error }; }

  componentDidCatch(error: Error): void {
    this.props.logger.error({ event: error instanceof StorageError ? 'storage.error' : 'app.error',
      kind: error instanceof StorageError ? error.kind : error.name });
  }

  render(): ComponentChildren {
    if (!this.state.error) return this.props.children;
    return <section aria-label="Application error">
      <InlineStatus tone="error" message="Something went wrong" fixHint={this.state.error instanceof StorageError
        ? this.state.error.fixHint : 'Reload to try again. Saved rounds stay on this device.'} />
      <ReloadButton />
    </section>;
  }
}

function ReloadButton(): JSX.Element {
  return <button onClick={() => window.location.reload()}>Reload scorecard</button>;
}
