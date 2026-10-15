import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { createManualParSource } from '../domain';
import type { ParSource } from '../domain';
import { createStorage, StorageError, toStorageError } from '../storage';
import type { Storage, OpenDatabaseOptions } from '../storage';
import type { Logger } from './logger';
import { createSessionController } from './session';
import type { SessionController } from './session';
import { createUndoController } from './undo';
import type { UndoController } from './undo';

export interface ContainerState {
  readonly updateLocked: boolean;
  readonly error: StorageError | null;
}

export interface Container extends Storage {
  readonly parSource: ParSource;
  readonly logger: Logger;
  readonly session: SessionController;
  readonly undo: UndoController;
  today(): string;
  createSession(): SessionController;
  subscribe(listener: () => void): () => void;
  subscribeState(listener: () => void): () => void;
  getSnapshot(): ContainerState;
  setUpdateLocked(locked: boolean): void;
  flush(): Promise<void>;
  refresh(): Promise<void>;
  canActivateUpdate(): Promise<boolean>;
}

/** Calendar date in the device's timezone, without a UTC day shift. */
export function localDate(now: Date = new Date()): string {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Compose one connection and all writers, with explicit lifecycle ownership. */
export async function buildContainer(opts: {
  dbName: string; logger: Logger; today?: () => string;
  storageFactory?: (name: string, options: OpenDatabaseOptions) => Promise<Storage>;
}): Promise<Container> {
  const today = opts.today ?? localDate;
  const listeners = new Set<() => void>();
  const stateListeners = new Set<() => void>();
  const sessions = new Set<SessionController>();
  let state: ContainerState = { updateLocked: false, error: null };
  let closed = false;
  let refreshPromise: Promise<void> | undefined;
  let refreshRequested = false;
  const notify = (subscribers: Set<() => void>): void => {
    for (const listener of subscribers) {
      try { listener(); }
      catch { opts.logger.error({ event: 'app.error', source: 'container.observer' }); }
    }
  };
  const publishState = (): void => notify(stateListeners);
  const failed = (error: unknown): void => {
    state = { ...state, error: toStorageError(error) };
    opts.logger.error({ event: 'storage.error', kind: state.error?.kind });
    publishState();
  };
  const storage = await (opts.storageFactory ?? createStorage)(opts.dbName, {
    onVersionChange: () => failed(new StorageError('blocked', 'A newer scorecard version opened this storage.', {
      fixHint: 'Your settled writes are saved. Reload this tab to use the current storage version.',
    })),
    onTerminated: () => failed(new StorageError('unavailable', 'The browser closed scorecard storage.', {
      fixHint: 'Keep this page open if changes are not saved. Retry saving, or reload after they are saved.',
    })),
  });
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`scorecard:${opts.dbName}`);
  const committed = (): void => {
    if (closed) return;
    notify(listeners);
    channel?.postMessage({ type: 'committed' });
  };
  const canMutate = (): boolean => !closed && !state.updateLocked && state.error === null;
  function createSession(): SessionController {
    if (closed) throw new StorageError('unavailable', 'This scorecard session is closed.');
    const session = createSessionController({ repository: storage.repository, today, logger: opts.logger,
      onCommit: committed, canMutate, onDispose: () => sessions.delete(session) });
    sessions.add(session);
    return session;
  }
  const session = createSession();
  const undo = createUndoController({ trash: storage.trash, repository: storage.repository,
    logger: opts.logger, onCommit: committed, canMutate });
  async function refresh(): Promise<void> {
    if (closed) return;
    refreshRequested = true;
    refreshPromise ??= (async () => {
      do {
        refreshRequested = false;
        try {
          await undo.load();
          await Promise.all([...sessions].map((editor) => editor.refresh()));
          notify(listeners);
        } catch (error) {
          // Controllers retain their contextual failures; only unrelated read failures belong here.
          if (![...sessions].some((editor) => editor.getSnapshot().error) && !undo.getSnapshot().error) failed(error);
        }
      } while (refreshRequested && !closed);
    })().finally(() => { refreshPromise = undefined; });
    await refreshPromise;
  }
  const focus = (): void => { void refresh(); };
  channel?.addEventListener('message', focus);
  window.addEventListener('focus', focus);
  function close(): void {
    if (closed) return;
    closed = true;
    window.removeEventListener('focus', focus);
    channel?.close();
    for (const editor of [...sessions]) editor.dispose();
    undo.dispose();
    listeners.clear(); stateListeners.clear(); storage.close();
  }
  try { await undo.load(); await session.load(); }
  catch (error) { close(); throw error; }
  return {
    ...storage, parSource: createManualParSource(storage.parMemory), logger: opts.logger, today, session, undo,
    createSession, close, refresh,
    subscribe(listener): () => void { listeners.add(listener); return () => listeners.delete(listener); },
    subscribeState(listener): () => void { stateListeners.add(listener); return () => stateListeners.delete(listener); },
    getSnapshot: () => state,
    setUpdateLocked(locked): void {
      if (state.updateLocked === locked) return;
      state = { ...state, updateLocked: locked }; publishState();
    },
    async flush(): Promise<void> { await Promise.all([...sessions].map((editor) => editor.flush())); },
    async canActivateUpdate(): Promise<boolean> {
      if (closed || state.error || undo.getSnapshot().pending || undo.getSnapshot().error) return false;
      try {
        await Promise.all([...sessions].map((editor) => editor.flush()));
        if ([...sessions].some((editor) => {
          const snapshot = editor.getSnapshot();
          return snapshot.loading || snapshot.pending || snapshot.error || Object.keys(snapshot.localDrafts).length;
        })) return false;
        // Read durable global state: visiting the log or another tab cannot hide an active round/draft/undo.
        const [active, finished, removed] = await Promise.all([
          storage.repository.getInProgress(), storage.repository.listFinished(), storage.trash.getPendingRemoval(),
        ]);
        return !active && !removed && !finished.some((round) => Object.keys(round.drafts).length);
      } catch { return false; }
    },
  };
}

export const ContainerContext = createContext<Container | null>(null);

/** Access the app-owned dependencies; missing providers are programming errors. */
export function useContainer(): Container {
  const container = useContext(ContainerContext);
  if (!container) throw new Error('The scorecard dependency provider is missing.');
  return container;
}
