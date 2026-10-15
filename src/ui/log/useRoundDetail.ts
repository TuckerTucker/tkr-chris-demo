import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Container } from '../../app/container';
import { useSnapshot } from '../../app/hooks';
import { navigate } from '../../app/router';
import type { SessionController, SessionSnapshot } from '../../app/session';
import { roundTotals } from '../../domain';
import type { Hole, HoleDraft, RoundTotals } from '../../domain';
import { StorageError, toStorageError } from '../../storage';
import type { StoredRound } from '../../storage';

export interface RoundDetailState {
  readonly controller: SessionController;
  readonly snapshot: SessionSnapshot;
  readonly round: StoredRound | null;
  readonly totals: RoundTotals | null;
  readonly editing: number | null;
  readonly loading: boolean;
  readonly pending: boolean;
  readonly removed: boolean;
  readonly error: StorageError | null;
  edit(number: number | null): void;
  saveDraft(draft: HoleDraft): Promise<void>;
  saveHole(hole: Hole): Promise<void>;
  cancel(): Promise<void>;
  remove(): Promise<void>;
  restore(): Promise<void>;
  openLog(): Promise<void>;
  recovered(): Promise<void>;
}

/** An isolated editor owns correction drafts; the container owns persistent removal and undo. */
export function useRoundDetail(c: Container, roundId: string,
  navigateTo: (path: string) => Promise<void> = navigate): RoundDetailState {
  const [generation, setGeneration] = useState(0);
  const controller = useMemo(() => c.createSession(), [c, roundId, generation]);
  const snapshot = useSnapshot(controller);
  const [editing, setEditing] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<StorageError | null>(null);
  const removing = useRef(false);
  const removedDurably = useRef(false);
  const busy = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true; removing.current = false; removedDurably.current = false; setRemoved(false); setError(null); setEditing(null);
    void controller.load(roundId).catch(() => undefined);
    const unsubscribe = c.subscribe(() => {
      if (removedDurably.current && !c.undo.getSnapshot().item) {
        // Global Undo can restore this same URL without a router remount.
        void c.repository.getRound(roundId).then(() => {
          if (alive.current && removedDurably.current) {
            removedDurably.current = false;
            setGeneration((value) => value + 1);
          }
        }).catch((cause: unknown) => {
          const typed = toStorageError(cause);
          if (alive.current && typed.kind !== 'not-found') setError(typed);
        });
        return;
      }
      if (!removing.current && !controller.getSnapshot().pending) void controller.refresh().catch(() => undefined);
    });
    return () => { alive.current = false; unsubscribe(); controller.dispose(); };
  }, [c, controller, roundId]);

  useEffect(() => {
    const round = snapshot.round;
    const cursor = round?.activeHole;
    setEditing(cursor !== null && cursor !== undefined && round?.holes.some((hole) => hole.number === cursor)
      && (round.drafts[cursor] || snapshot.localDrafts[cursor]) ? cursor : null);
    // Own autosaves preserve editor identity; deliberate reload/conflict recovery changes the version.
  }, [snapshot.editorVersion]);

  async function action(run: () => Promise<void>): Promise<void> {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(null);
    try { await run(); }
    catch (cause) {
      const typed = toStorageError(cause);
      if (alive.current) setError(typed);
      c.logger.error({ event: 'storage.error', kind: typed.kind });
      throw typed;
    } finally { busy.current = false; if (alive.current) setPending(false); }
  }

  function remainingEditor(): void {
    const round = controller.getSnapshot().round;
    const cursor = round?.activeHole;
    setEditing(cursor !== null && cursor !== undefined && round?.drafts[cursor] ? cursor : null);
  }

  async function cancel(): Promise<void> {
    await action(async () => {
      if (editing === null) return;
      await controller.discardDraft(editing);
      remainingEditor();
    });
  }

  async function openLog(): Promise<void> {
    await action(async () => { await navigateTo('/log'); });
  }

  return {
    controller, snapshot, round: snapshot.round, totals: snapshot.round ? roundTotals(snapshot.round.holes) : null,
    editing, loading: snapshot.loading || (!snapshot.round && !snapshot.error && !removed), pending, removed, error: snapshot.error ?? error,
    edit(number): void {
      if (removed || busy.current) return;
      if (number === null) { void cancel().catch(() => undefined); return; }
      void action(async () => {
        await controller.flush();
        const state = controller.getSnapshot();
        const confirmed = state.round?.holes.find((hole) => hole.number === number);
        if (!confirmed) throw new StorageError('invalid', 'Choose a recorded hole to correct.');
        setEditing(number);
        await controller.saveDraft(state.localDrafts[number] ?? state.round?.drafts[number] ?? confirmed);
      }).catch(() => undefined);
    },
    async saveDraft(draft): Promise<void> { setError(null); await controller.saveDraft(draft); },
    async saveHole(hole): Promise<void> {
      await action(async () => { await controller.correct(hole); remainingEditor(); });
    },
    cancel, openLog,
    async recovered(): Promise<void> { setError(null); remainingEditor(); },
    async remove(): Promise<void> {
      await action(async () => {
        await c.flush();
        const round = controller.getSnapshot().round;
        if (!round) throw new StorageError('not-found', 'This round is no longer available.');
        removing.current = true;
        try { await c.undo.remove(round.id, round.revision); }
        catch (cause) { removing.current = false; throw cause; }
        setRemoved(true);
        removedDurably.current = true;
        // No registered editor may refresh a round it has just deliberately removed.
        controller.dispose();
        if (c.session.getSnapshot().round?.id === round.id) await c.session.load();
        await navigateTo('/log');
      });
    },
    async restore(): Promise<void> {
      await action(async () => {
        await c.undo.undo();
      });
    },
  };
}
