import type { Hole, HoleDraft } from '../domain';
import type { RoundRepository, StoredRound } from '../storage';
import { StorageError, toStorageError } from '../storage';
import type { Logger } from './logger';

export interface SessionSnapshot {
  readonly round: StoredRound | null;
  readonly loading: boolean;
  readonly pending: boolean;
  readonly error: StorageError | null;
  readonly saveState: 'saving' | 'saved' | 'error';
  readonly localDrafts: Readonly<Record<number, HoleDraft>>;
  readonly conflictRound: StoredRound | null;
  readonly editorVersion: number;
}

export interface SessionController {
  getSnapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
  load(roundId?: string): Promise<void>;
  refresh(): Promise<void>;
  start(): Promise<void>;
  saveDraft(draft: HoleDraft): Promise<void>;
  discardDraft(holeNumber: number): Promise<void>;
  save(hole: Hole): Promise<void>;
  correct(hole: Hole): Promise<void>;
  continueRound(): Promise<void>;
  finish(): Promise<void>;
  flush(): Promise<void>;
  retry(): Promise<void>;
  resolveConflict(strategy: 'reload' | 'reapply'): Promise<void>;
  dispose(): void;
}

export interface SessionOptions {
  readonly repository: RoundRepository;
  readonly today: () => string;
  readonly logger: Pick<Logger, 'info' | 'error'>;
  readonly onCommit?: () => void;
  readonly canMutate?: () => boolean;
  readonly onDispose?: () => void;
}

interface Command {
  readonly run: () => Promise<void>;
  readonly epoch: number;
}

function omitDraft(drafts: Readonly<Record<number, HoleDraft>>, number: number): Readonly<Record<number, HoleDraft>> {
  return Object.fromEntries(Object.entries(drafts).filter(([key]) => Number(key) !== number));
}

/** One ordered writer retains every uncommitted input and exposes explicit conflict recovery. */
export function createSessionController(options: SessionOptions): SessionController {
  const { repository, logger } = options;
  let state: SessionSnapshot = { round: null, loading: false, pending: false, error: null,
    saveState: 'saved', localDrafts: {}, conflictRound: null, editorVersion: 0 };
  let tail: Promise<void> = Promise.resolve();
  let mutations = 0;
  let loads = 0;
  let epoch = 0;
  let disposed = false;
  let selectedId: string | undefined;
  let failedCommand: Command | undefined;
  let failedRead: (() => Promise<void>) | undefined;
  let admissionError: StorageError | undefined;
  const listeners = new Set<() => void>();
  const commands = new Map<string, Promise<void>>();

  function safelyNotify(callback: () => void): void {
    try { callback(); }
    catch { logger.error({ event: 'app.error', source: 'session.observer' }); }
  }

  function publish(patch: Partial<SessionSnapshot> = {}): void {
    state = { ...state, ...patch, pending: mutations > 0, loading: loads > 0 };
    state = { ...state, saveState: state.error ? 'error'
      : mutations > 0 || Object.keys(state.localDrafts).length > 0 ? 'saving' : 'saved' };
    if (!disposed) for (const listener of listeners) safelyNotify(listener);
  }

  function committed(round: StoredRound, event?: string): void {
    publish({ round });
    if (event) logger.info({ event, roundId: round.id, holes: round.holes.length });
    if (options.onCommit) safelyNotify(options.onCommit);
  }

  function rejectAdmission(): StorageError | undefined {
    if (disposed) return new StorageError('io', 'This editor has been closed.', { fixHint: 'Open the round again to continue.' });
    if (options.canMutate && !options.canMutate()) return new StorageError('blocked', 'An app update is being prepared.', {
      fixHint: 'Wait for the update check to finish, then retry your change.',
    });
    if (admissionError && state.error === admissionError) publish({ error: null });
    admissionError = undefined;
    return undefined;
  }

  async function report(error: unknown): Promise<StorageError> {
    const typed = toStorageError(error);
    let conflictRound = state.conflictRound;
    if (typed.kind === 'conflict') {
      try { conflictRound = state.round ? await repository.getRound(state.round.id) : await repository.getInProgress() ?? null; }
      catch { conflictRound = null; }
      publish({ localDrafts: { ...state.round?.drafts, ...state.localDrafts } });
    }
    logger.error({ event: 'storage.error', kind: typed.kind });
    publish({ error: typed, conflictRound });
    return typed;
  }

  function enqueue(action: () => Promise<void>, mutation = false, loading = false): Promise<void> {
    if (mutation) mutations += 1;
    if (loading) loads += 1;
    publish();
    const result = tail.then(async () => {
      try { await action(); }
      catch (error) { throw await report(error); }
      finally {
        if (mutation) mutations -= 1;
        if (loading) loads -= 1;
        publish();
      }
    });
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  function admissionFailure(error: StorageError): Promise<void> {
    const result: Promise<void> = Promise.reject(error);
    // Event handlers still receive the rejection; an ignored promise never becomes console-only.
    void result.catch(() => undefined);
    if (mutations === 0) { admissionError = error; publish({ error }); }
    return result;
  }

  function requireHealthy(allowValidation = false): void {
    if (!disposed && admissionError && state.error === admissionError && (options.canMutate?.() ?? true)) {
      admissionError = undefined;
      publish({ error: null });
    }
    if (state.error && !(allowValidation && state.error.kind === 'invalid' && Object.keys(state.localDrafts).length === 0)) {
      throw state.error;
    }
  }

  async function current(): Promise<StoredRound> {
    if (!state.round) throw new StorageError('not-found', 'There is no round open in this editor.');
    let round: StoredRound;
    try { round = await repository.getRound(state.round.id); }
    catch (error) {
      if (toStorageError(error).kind === 'not-found') throw new StorageError('conflict', 'This round was removed in another tab.', { cause: error });
      throw error;
    }
    if (round.revision !== state.round.revision) throw new StorageError('conflict', 'This round changed in another tab.');
    return round;
  }

  async function persistDraft(draft: HoleDraft): Promise<void> {
    const round = await current();
    const updated = await repository.saveDraft(round.id, draft, round.revision);
    if (state.localDrafts[draft.number] === draft) publish({ localDrafts: omitDraft(state.localDrafts, draft.number) });
    committed(updated);
  }

  function clearInvalid(): void {
    if (state.error?.kind === 'invalid') { failedCommand = undefined; publish({ error: null }); }
  }

  function command(key: string, run: () => Promise<void>): Promise<void> {
    const existing = commands.get(key);
    if (existing) return existing;
    const denied = rejectAdmission();
    if (denied) return admissionFailure(denied);
    const operation: Command = { run, epoch };
    const result = enqueue(async () => {
      try { requireHealthy(); await run(); failedCommand = undefined; }
      catch (error) { failedCommand = operation; throw error; }
    }, true);
    commands.set(key, result);
    void result.then(() => commands.delete(key), () => commands.delete(key));
    return result;
  }

  function confirm(hole: Hole, correction: boolean): Promise<void> {
    const key = correction ? 'correct' : 'save';
    const existing = commands.get(key);
    if (existing) return existing;
    const denied = rejectAdmission();
    if (denied) return admissionFailure(denied);
    clearInvalid();
    const value = { ...hole };
    const capturedEpoch = epoch;
    publish({ localDrafts: { ...state.localDrafts, [hole.number]: value } });
    return command(key, async () => {
      if (epoch !== capturedEpoch) throw new StorageError('invalid', 'The hole changed while confirmation was waiting.', {
        fixHint: 'Review the latest values and confirm the hole again.',
      });
      const round = await current();
      const updated = await (correction ? repository.updateHole(round.id, value, round.revision)
        : repository.saveHole(round.id, value, round.revision));
      if (state.localDrafts[value.number] === value) publish({ localDrafts: omitDraft(state.localDrafts, value.number) });
      committed(updated, 'hole.saved');
    });
  }

  async function readSelected(): Promise<StoredRound | null> {
    return selectedId !== undefined ? await repository.getRound(selectedId) : await repository.getInProgress() ?? null;
  }

  async function loadRound(roundId?: string): Promise<void> {
    requireHealthy(true);
    if (Object.keys(state.localDrafts).length) throw new StorageError('io', 'Some edits have not been saved.', {
      fixHint: 'Retry saving these edits before opening another round.',
    });
    let round: StoredRound | null;
    try { round = roundId !== undefined ? await repository.getRound(roundId) : await repository.getInProgress() ?? null; }
    catch (error) { failedRead = () => loadRound(roundId); throw error; }
    selectedId = roundId;
    failedCommand = undefined;
    failedRead = undefined;
    publish({ round, localDrafts: {}, conflictRound: null, error: null, editorVersion: state.editorVersion + 1 });
  }

  async function refreshRound(): Promise<void> {
    let fresh: StoredRound | null;
    try { fresh = await readSelected(); }
    catch (error) {
      if (toStorageError(error).kind === 'not-found') fresh = null;
      else { failedRead = refreshRound; throw error; }
    }
    failedRead = undefined;
    const changed = fresh?.id !== state.round?.id || fresh?.revision !== state.round?.revision;
    const hasDrafts = Object.keys({ ...state.round?.drafts, ...state.localDrafts }).length > 0;
    if (changed && hasDrafts) {
      publish({ conflictRound: fresh, localDrafts: { ...state.round?.drafts, ...state.localDrafts } });
      throw new StorageError('conflict', 'This round changed while you were editing.');
    }
    if (state.error || Object.keys(state.localDrafts).length) return;
    if (changed) publish({ round: fresh, conflictRound: null, editorVersion: state.editorVersion + 1 });
  }

  // Retry bypasses the error latch deliberately, but conflict needs an explicit decision.
  function retry(): Promise<void> {
    const existing = commands.get('retry');
    if (existing) return existing;
    const denied = rejectAdmission();
    if (denied) return admissionFailure(denied);
    const result = enqueue(async () => {
      if (state.error?.kind === 'conflict') throw state.error;
      const retryCommand = failedCommand;
      const retryRead = failedRead;
      publish({ error: null });
      if (retryRead && !retryCommand) await retryRead();
      for (const draft of Object.values(state.localDrafts)) await persistDraft(draft);
      if (retryCommand && retryCommand.epoch === epoch) {
        await retryCommand.run();
        failedCommand = undefined;
      } else failedCommand = undefined;
      failedRead = undefined;
    }, true);
    commands.set('retry', result);
    void result.then(() => commands.delete('retry'), () => commands.delete('retry'));
    return result;
  }

  const controller: SessionController = {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load: (roundId) => enqueue(() => loadRound(roundId), false, true),
    refresh: () => enqueue(refreshRound),
    start() {
      return command('start', async () => {
        const round = await repository.createRound(options.today());
        selectedId = undefined;
        publish({ localDrafts: {}, conflictRound: null, editorVersion: state.editorVersion + 1 });
        committed(round, 'round.started');
      });
    },
    saveDraft(draft) {
      const denied = rejectAdmission();
      if (denied) return admissionFailure(denied);
      clearInvalid();
      const value = { ...draft };
      epoch += 1;
      publish({ localDrafts: { ...state.localDrafts, [draft.number]: value } });
      return enqueue(async () => { clearInvalid(); requireHealthy(); await persistDraft(value); }, true);
    },
    discardDraft(number) {
      clearInvalid();
      return command(`discard:${number}`, async () => {
        const round = await current();
        const value = state.localDrafts[number];
        const updated = await repository.discardDraft(round.id, number, round.revision);
        if (state.localDrafts[number] === value) publish({ localDrafts: omitDraft(state.localDrafts, number) });
        committed(updated);
        publish({ editorVersion: state.editorVersion + 1 });
      });
    },
    save: (hole) => confirm(hole, false),
    correct: (hole) => confirm(hole, true),
    continueRound() {
      return command('continue', async () => {
        const round = await current();
        committed(await repository.continueRound(round.id, round.revision));
        publish({ editorVersion: state.editorVersion + 1 });
      });
    },
    finish() {
      return command('finish', async () => {
        const round = await current();
        committed(await repository.finishRound(round.id, round.revision), 'round.finished');
        publish({ editorVersion: state.editorVersion + 1 });
      });
    },
    async flush() {
      // Include work admitted while an earlier queue tail was settling.
      let observed: Promise<void>;
      do { observed = tail; await observed; } while (observed !== tail);
      // A failed read has no edits to lose and must not trap a missing-round route.
      // Failed mutations and retained local input still require explicit recovery.
      if (failedRead && !failedCommand && Object.keys(state.localDrafts).length === 0) return;
      requireHealthy(true);
      if (Object.keys(state.localDrafts).length) throw new StorageError('io', 'Some edits have not been saved.');
    },
    retry,
    resolveConflict(strategy) {
      const denied = rejectAdmission();
      if (denied) return admissionFailure(denied);
      return enqueue(async () => {
        let fresh: StoredRound | null;
        try { fresh = state.round ? await repository.getRound(state.round.id) : await readSelected(); }
        catch (error) { if (toStorageError(error).kind === 'not-found') fresh = null; else throw error; }
        if (strategy === 'reapply' && !fresh) throw new StorageError('not-found', 'This round was removed; its edits cannot be reapplied.');
        failedCommand = undefined;
        failedRead = undefined;
        publish({ round: fresh, error: null, conflictRound: null,
          localDrafts: strategy === 'reload' ? {} : state.localDrafts, editorVersion: state.editorVersion + 1 });
        if (strategy === 'reapply') for (const draft of Object.values(state.localDrafts)) await persistDraft(draft);
      }, true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      options.onDispose?.();
    },
  };


  return controller;
}
