import { render } from 'preact';
import type { JSX } from 'preact';
import { App } from './app/App';
import { buildContainer } from './app/container';
import type { Container } from './app/container';
import { createLogger } from './app/logger';
import { startupPath } from './app/router';
import { registerUpdates } from './app/sw-update';
import type { OfflineStatus } from './app/sw-update';
import { toStorageError } from './storage';
import type { StorageError } from './storage';
import { InlineStatus } from './ui/kit';
import { createThemeController, THEME_STORAGE_KEY } from './app/theme';

const root = document.getElementById('app');
if (!root) throw new Error('The application mount element is missing.');
const mount = root;
const logger = createLogger();
const theme = createThemeController({
  read: () => window.localStorage.getItem(THEME_STORAGE_KEY),
  write: (preference) => window.localStorage.setItem(THEME_STORAGE_KEY, preference),
  apply: (preference) => { document.documentElement.dataset.theme = preference; },
  logger,
});
const themeChanged = (event: StorageEvent): void => {
  if (event.key === THEME_STORAGE_KEY || event.key === null) theme.refresh();
};
window.addEventListener('storage', themeChanged);
let container: Container | undefined;
let startupError: StorageError | undefined;
let starting = false;
let disposed = false;
let unsubscribe: (() => void) | undefined;
let offline: OfflineStatus = { ready: false, error: null, updateAvailable: false, updating: false };
let persistence = 'Rounds are saved in this browser. Clearing site data removes them.';

function Startup(): JSX.Element {
  return <main><h1>Golf Scorecard</h1>{startupError
    ? <section aria-label="Storage initialization"><InlineStatus tone="error" message={startupError.message} fixHint={startupError.fixHint} />
      <button disabled={starting} onClick={() => { void boot(); }}>{starting ? 'Opening storage…' : 'Retry opening storage'}</button></section>
    : <p role="status">Opening scorecards…</p>}
    <p role="status">{offline.ready ? 'Ready offline' : 'Preparing offline access…'}</p>
    {offline.error && <InlineStatus tone="error" message={offline.error} />}</main>;
}

function paint(): void {
  if (disposed) return;
  render(container && updates ? <App container={container} offline={offline} updates={updates} persistence={persistence} theme={theme} /> : <Startup />, mount);
}

async function boot(): Promise<void> {
  if (starting || container || disposed) return;
  starting = true; paint();
  let candidate: Container | undefined;
  try {
    candidate = await buildContainer({ dbName: 'golf-scorecard', logger });
    const requestedHash = window.location.hash;
    const path = await startupPath(candidate);
    if (disposed) { candidate.close(); return; }
    // Navigation during the asynchronous storage read takes precedence over recovery.
    if (window.location.hash === requestedHash) window.history.replaceState(null, '', `#${path}`);
    container = candidate;
    container.setUpdateLocked(offline.updating);
    startupError = undefined;
    unsubscribe = container.subscribe(() => {
      // Only safe transitions need a network update check; draft writes stay local.
      void container?.canActivateUpdate().then((safe) => {
        if (safe) return updates?.checkForUpdate();
      }).catch((error: unknown) => logger.error({ event: 'sw.update', kind: toStorageError(error).kind }));
    });
    void updates?.checkForUpdate();
    if (navigator.storage?.persist) {
      void navigator.storage.persist().then((persistent) => {
        persistence = persistent ? 'Saved on this device with persistent browser storage. Clearing site data removes rounds.'
          : 'Saved in this browser. The browser may remove data when storage is low; clearing site data removes rounds.';
        paint();
      }).catch(() => { persistence = 'Saved in this browser. Persistent storage could not be requested; clearing site data removes rounds.'; paint(); });
    }
  } catch (error) {
    candidate?.close();
    startupError = toStorageError(error);
    logger.error({ event: 'storage.error', kind: startupError.kind });
  } finally { starting = false; paint(); }
}

const updates = registerUpdates({
  canActivate: async () => container ? container.canActivateUpdate() : false,
  onStatus(status): void { offline = status; container?.setUpdateLocked(status.updating); paint(); },
  logger,
});
void boot();
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('storage', themeChanged);
  disposed = true; unsubscribe?.(); container?.close(); updates?.dispose(); render(null, mount);
});
