import type { PendingRemoval, RoundRepository, RoundTrash, StoredRound } from '../storage';
import { StorageError, toStorageError } from '../storage';
import type { Logger } from './logger';

export interface UndoSnapshot {
  readonly item: PendingRemoval | null;
  readonly pending: boolean;
  readonly error: StorageError | null;
}

export interface UndoController {
  getSnapshot(): UndoSnapshot;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  remove(roundId: string, expectedRevision: number): Promise<void>;
  undo(): Promise<StoredRound>;
  dismiss(): Promise<void>;
  dispose(): void;
}

export interface UndoOptions {
  readonly trash: RoundTrash;
  readonly repository: Pick<RoundRepository, 'getRound'>;
  readonly logger: Pick<Logger, 'info' | 'error'>;
  readonly onCommit?: () => void;
  readonly canMutate?: () => boolean;
}

/** One persistent undo region, independent of routes and without timer-based destruction. */
export function createUndoController(options: UndoOptions): UndoController {
  const { trash, repository, logger } = options;
  let state: UndoSnapshot = { item: null, pending: false, error: null };
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;
  let disposed = false;
  const listeners = new Set<() => void>();
  const commands = new Map<string, Promise<unknown>>();

  function notify(callback: () => void): void {
    try { callback(); } catch { logger.error({ event: 'app.error', source: 'undo.observer' }); }
  }

  function publish(patch: Partial<UndoSnapshot> = {}): void {
    state = { ...state, ...patch, pending: pending > 0 };
    if (!disposed) for (const listener of listeners) notify(listener);
  }

  function committed(event: string, roundId: string): void {
    logger.info({ event, roundId });
    if (options.onCommit) notify(options.onCommit);
  }

  function enqueue<T>(key: string, action: () => Promise<T>, mutation = true): Promise<T> {
    const existing = commands.get(key);
    if (existing) return existing as Promise<T>;
    if (disposed || (mutation && options.canMutate && !options.canMutate())) {
      const error = new StorageError(disposed ? 'io' : 'blocked', disposed ? 'This undo controller has closed.' : 'An app update is being prepared.', {
        fixHint: disposed ? 'Reopen the scorecard to continue.' : 'Wait for the update check, then retry.',
      });
      publish({ error });
      const rejected = Promise.reject<T>(error);
      void rejected.catch(() => undefined);
      return rejected;
    }
    pending += 1;
    publish();
    const result = tail.then(async () => {
      publish({ error: null });
      try { return await action(); }
      catch (error) {
        const typed = toStorageError(error);
        logger.error({ event: 'storage.error', kind: typed.kind });
        publish({ error: typed });
        throw typed;
      } finally { pending -= 1; publish(); }
    });
    tail = result.then(() => undefined, () => undefined);
    commands.set(key, result);
    void result.then(() => commands.delete(key), () => commands.delete(key));
    return result;
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load: () => enqueue('load', async () => { publish({ item: await trash.getPendingRemoval() ?? null }); }, false),
    remove: (roundId, revision) => enqueue(`remove:${roundId}`, async () => {
      const item = await trash.removeRound(roundId, revision);
      publish({ item });
      committed('round.removed', roundId);
    }),
    undo() {
      const item = state.item;
      return enqueue(`undo:${item?.token ?? 'none'}`, async () => {
        if (!item) throw new StorageError('not-found', 'There is no pending round to restore.');
        let round: StoredRound;
        try { round = await trash.restoreRound(item.token); }
        catch (error) {
          if (toStorageError(error).kind !== 'not-found') throw error;
          publish({ item: await trash.getPendingRemoval() ?? null });
          // Another tab may already have completed this exact undo.
          round = await repository.getRound(item.round.id);
          committed('round.restored', round.id);
          return round;
        }
        publish({ item: await trash.getPendingRemoval() ?? null });
        committed('round.restored', round.id);
        return round;
      });
    },
    dismiss() {
      const item = state.item;
      return enqueue(`dismiss:${item?.token ?? 'none'}`, async () => {
        if (!item) { publish({ item: await trash.getPendingRemoval() ?? null }); return; }
        try { await trash.purgeTrash(item.token); }
        catch (error) { if (toStorageError(error).kind !== 'not-found') throw error; }
        publish({ item: await trash.getPendingRemoval() ?? null });
        if (options.onCommit) notify(options.onCommit);
      });
    },
    dispose() { disposed = true; listeners.clear(); },
  };
}
