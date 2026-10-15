import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { InlineStatus, UndoBar } from '../ui/kit';
import { ContainerContext } from './container';
import type { Container } from './container';
import { ErrorBoundary } from './ErrorBoundary';
import { useSnapshot } from './hooks';
import { navigate, resumePath, Router } from './router';
import type { RouteDef } from './router';
import { routes } from './routes';
import type { OfflineStatus, UpdateHandle } from './sw-update';
import './app.css';
import { ThemeChooser } from './ThemeChooser';
import type { ThemeController } from './theme';

/** Application layout owns persistent undo, storage and offline feedback. */
export function App({ container: c, offline, updates, views = routes, persistence, theme }: {
  container: Container; offline: OfflineStatus; updates: UpdateHandle; views?: RouteDef[]; persistence: string;
  theme: ThemeController;
}): JSX.Element {
  const undo = useSnapshot(c.undo);
  const [state, setState] = useState(c.getSnapshot());
  const [navigationError, setNavigationError] = useState<string | null>(null);
  useEffect(() => {
    const changed = (): void => setState(c.getSnapshot());
    const unsubscribe = c.subscribeState(changed);
    changed();
    return unsubscribe;
  }, [c]);
  async function openLog(): Promise<void> {
    try { await navigate('/log'); setNavigationError(null); }
    catch (error) { setNavigationError(error instanceof Error ? error.message : 'Save changes before leaving.'); }
  }
  return <ContainerContext.Provider value={c}><main>
    <header class="app-header"><h1>Golf Scorecard</h1>
      <button onClick={() => { void openLog(); }}>Round log</button></header>
    <ErrorBoundary logger={c.logger}>
      {navigationError && <InlineStatus tone="error" message={navigationError} fixHint="Resolve the save error, then try again." />}
      {state.error && <section aria-label="Storage status"><InlineStatus tone="error" message={state.error.message} fixHint={state.error.fixHint} />
        <button onClick={() => window.location.reload()}>Reload storage</button></section>}
      {offline.updating && <p role="status">Preparing update. Saved rounds stay on this device.</p>}
      <fieldset class="app-content" disabled={state.updateLocked || state.error !== null}>
        <legend class="sr-only">Scorecard</legend>
        {undo.item && <UndoBar message={undo.item.round.status === 'in-progress' ? 'Round abandoned. You can still undo this.' : 'Round removed. You can still undo this.'}
          pending={undo.pending} error={undo.error?.message} onUndo={async () => {
            const restored = await c.undo.undo();
            await c.session.load();
            await navigate(resumePath(restored));
          }} onDismiss={() => c.undo.dismiss()} />}
        {!undo.item && undo.error && <InlineStatus tone="error" message={undo.error.message} fixHint={undo.error.fixHint} />}
        <Router routes={views} />
      </fieldset>
      <footer class="app-footer"><ThemeChooser controller={theme} />
        <p role="status">{offline.ready ? 'Ready offline' : 'Preparing offline access…'}</p>
        {offline.error && <><InlineStatus tone="error" message={offline.error} />
          <button onClick={() => { void updates.checkForUpdate(); }}>Retry offline access</button></>}
        {offline.updateAvailable && <button disabled={offline.updating} onClick={() => { void updates.applyUpdate(); }}>Update app</button>}
        <p>{persistence}</p></footer>
    </ErrorBoundary>
  </main></ContainerContext.Provider>;
}
