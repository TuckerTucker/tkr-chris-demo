/** Current offline/update status, presented in place and used to lock mutations. */
export interface OfflineStatus {
  readonly ready: boolean;
  readonly error: string | null;
  readonly updateAvailable: boolean;
  readonly updating: boolean;
}

/** Lifecycle owned by the application; applying an update requires explicit user intent. */
export interface UpdateHandle {
  checkForUpdate(): Promise<void>;
  applyUpdate(): Promise<void>;
  dispose(): void;
}

interface UpdateOptions {
  canActivate(): Promise<boolean>;
  onStatus(status: OfflineStatus): void;
  logger: { info(obj: object): void; error(obj: object): void };
}

let registrationPromise: Promise<ServiceWorkerRegistration> | undefined;

/** Register once, coordinate tab safety, and expose offline readiness without reloading other tabs. */
export function registerUpdates(opts: UpdateOptions): UpdateHandle {
  let disposed = false;
  let registration: ServiceWorkerRegistration | undefined;
  let status: OfflineStatus = { ready: false, error: null, updateAvailable: false, updating: false };
  let lockNonce: string | undefined;
  let lockTimer: ReturnType<typeof setTimeout> | undefined;
  let initiator = false;
  const build: string = import.meta.env.VITE_APP_BUILD_ID;
  const schema = Number(import.meta.env.VITE_APP_SCHEMA_VERSION);
  const cleanup: (() => void)[] = [];
  const watchedWorkers = new Set<ServiceWorker>();

  function publish(change: Partial<OfflineStatus>): void {
    if (disposed) return;
    status = { ...status, ...change };
    opts.onStatus(status);
  }

  function unlock(error: string | null = null): void {
    clearTimeout(lockTimer);
    lockNonce = undefined;
    publish({ updating: false, error });
  }

  function failure(error: unknown): void {
    opts.logger.error({ event: 'sw.update', kind: error instanceof Error ? error.name : 'unknown' });
    unlock('Offline setup or update failed. Check your connection and retry; saved rounds are unchanged.');
  }

  async function refresh(): Promise<void> {
    const safe = await opts.canActivate();
    publish({ ready: Boolean(navigator.serviceWorker.controller), updateAvailable: Boolean(registration?.waiting) && safe });
    registration?.active?.postMessage({ type: 'GOLF_PRUNE_CACHES' });
  }

  async function onMessage(event: MessageEvent<unknown>): Promise<void> {
    const value = event.data;
    if (!value || typeof value !== 'object' || !('type' in value)) return;
    const data = value as { type: string; nonce?: string; schema?: number; reason?: string };
    const worker = event.source as ServiceWorker | null;
    if (data.type === 'GOLF_BUILD_QUERY' && data.nonce) {
      worker?.postMessage({ type: 'GOLF_CLIENT_REPLY', nonce: data.nonce, build, schema });
    } else if (data.type === 'GOLF_UPDATE_PREPARE' && data.nonce) {
      const nonce = data.nonce;
      if (lockNonce && lockNonce !== nonce) {
        worker?.postMessage({ type: 'GOLF_CLIENT_REPLY', nonce, safe: false, build, schema });
        return;
      }
      lockNonce = nonce;
      // Synchronous callback freezes mutation entry points before readiness is awaited.
      publish({ updating: true, error: null });
      clearTimeout(lockTimer);
      lockTimer = setTimeout(() => {
        initiator = false;
        unlock('The update was deferred because another tab did not respond. Try again when all tabs are ready.');
      }, 12000);
      const safe = data.schema === schema && await opts.canActivate();
      if (disposed || lockNonce !== nonce) return;
      worker?.postMessage({ type: 'GOLF_CLIENT_REPLY', nonce, safe, build, schema });
      if (!safe) { initiator = false; unlock(); }
    } else if (data.type === 'GOLF_UPDATE_ABORT' && (!lockNonce || data.nonce === lockNonce)) {
      initiator = false;
      unlock(data.reason ?? 'The update was deferred. Try again after all tabs are ready.');
    } else if (data.type === 'GOLF_UPDATE_ERROR' || data.type === 'GOLF_CACHE_ERROR') {
      failure(new Error('Service worker operation failed'));
    }
  }

  function controllerChanged(): void {
    const reload = initiator && Boolean(lockNonce);
    initiator = false;
    unlock();
    publish({ ready: true, updateAvailable: false });
    opts.logger.info({ event: 'sw.update', state: 'activated' });
    if (reload) window.location.reload();
    else void refresh().catch(failure);
  }

  function watch(worker: ServiceWorker | null): void {
    if (!worker || watchedWorkers.has(worker)) return;
    watchedWorkers.add(worker);
    let installed = ['installed', 'activating', 'activated'].includes(worker.state);
    const stateChanged = (): void => {
      if (['installed', 'activating', 'activated'].includes(worker.state)) installed = true;
      if (worker.state === 'redundant') {
        worker.removeEventListener('statechange', stateChanged);
        watchedWorkers.delete(worker);
        // An installed worker normally becomes redundant when its replacement
        // activates. That is not an installation failure and must not release
        // the initiating tab's lock before controllerchange observes it.
        if (!installed) failure(new Error('Service worker installation failed'));
      } else if (worker.state === 'installed' || worker.state === 'activated') void refresh().catch(failure);
    };
    worker.addEventListener('statechange', stateChanged);
    cleanup.push(() => worker.removeEventListener('statechange', stateChanged));
  }

  async function ensureRegistered(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      publish({ error: 'Offline mode is unavailable in this browser. Use a browser that supports service workers.' });
      return;
    }
    registrationPromise ??= navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch((error: unknown) => {
      registrationPromise = undefined;
      throw error;
    });
    const result = await registrationPromise;
    if (disposed) return;
    if (!registration) {
      registration = result;
      const updateFound = (): void => watch(result.installing);
      result.addEventListener('updatefound', updateFound);
      cleanup.push(() => result.removeEventListener('updatefound', updateFound));
      watch(result.installing);
    }
    await refresh();
  }

  const messageListener = (event: MessageEvent<unknown>): void => { void onMessage(event).catch(failure); };
  const focusListener = (): void => { void checkForUpdate(); };
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', messageListener);
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
    window.addEventListener('focus', focusListener);
  }
  opts.onStatus(status);
  void ensureRegistered().catch(failure);

  async function checkForUpdate(): Promise<void> {
    try {
      await ensureRegistered();
      if (disposed) return;
      // Browsing offline is expected; retain readiness and avoid a misleading network error.
      if (navigator.onLine) await registration?.update();
      await refresh();
      if (registration) publish({ error: null });
    } catch (error) { failure(error); }
  }

  return {
    checkForUpdate,
    async applyUpdate(): Promise<void> {
      try {
        await ensureRegistered();
        if (!registration?.waiting || disposed || status.updating) return;
        if (!await opts.canActivate()) {
          publish({ error: 'Finish your current round and saved changes before updating.' });
          return;
        }
        initiator = true;
        registration.waiting.postMessage({ type: 'GOLF_APPLY_UPDATE' });
      } catch (error) { failure(error); }
    },
    dispose(): void {
      clearTimeout(lockTimer);
      // Handover is not an ACK. A waiting worker with a lost owner times out safely.
      disposed = true;
      cleanup.forEach((remove) => remove());
      navigator.serviceWorker?.removeEventListener('message', messageListener);
      navigator.serviceWorker?.removeEventListener('controllerchange', controllerChanged);
      window.removeEventListener('focus', focusListener);
    },
  };
}
