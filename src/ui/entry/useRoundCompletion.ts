import { useEffect, useRef, useState } from 'preact/hooks';
import type { Container } from '../../app/container';
import { navigate, resumePath } from '../../app/router';
import { nextStep } from '../../domain';
import type { NextStep } from '../../domain';
import { StorageError, toStorageError } from '../../storage';
import type { RoundSession } from './useRoundSession';

export interface RoundCompletion {
  readonly step: NextStep;
  readonly pending: boolean;
  readonly error: StorageError | null;
  finishAtNine(): Promise<void>;
  continueToTen(): Promise<void>;
  finish(): Promise<void>;
  abandon(): Promise<void>;
  restore(): Promise<void>;
}

/** Durable completion and removal actions navigate only after their transaction commits. */
export function useRoundCompletion(session: RoundSession, c: Container): RoundCompletion {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<StorageError | null>(null);
  const operation = useRef<Promise<void> | null>(null);
  useEffect(() => { if (!session.error) setError(null); }, [session.error]);
  function run(action: () => Promise<void>): Promise<void> {
    if (operation.current) return operation.current;
    setPending(true); setError(null);
    const result = (async () => {
      try { await action(); }
      catch (failure) { const typed = toStorageError(failure); setError(typed); throw typed; }
      finally { setPending(false); operation.current = null; }
    })();
    operation.current = result;
    return result;
  }
  async function finish(): Promise<void> {
    await c.session.finish();
    const round = c.session.getSnapshot().round;
    if (!round || round.status !== 'finished') throw new StorageError('io', 'The round has not finished saving.');
    await navigate(`/round/${encodeURIComponent(round.id)}/summary`);
  }
  return {
    step: session.round ? nextStep(session.round) : 'enter-hole',
    pending: pending || session.pending, error: session.error ?? error,
    finishAtNine: () => run(finish), finish: () => run(finish),
    continueToTen: () => run(async () => {
      await c.session.continueRound();
      const round = c.session.getSnapshot().round;
      if (round) await navigate(resumePath(round));
    }),
    abandon: () => run(async () => {
      await c.flush();
      const round = c.session.getSnapshot().round;
      if (!round || round.status !== 'in-progress') throw new StorageError('not-found', 'There is no active round to abandon.');
      await c.undo.remove(round.id, round.revision);
      await c.session.load();
      await navigate('/log');
    }),
    restore: () => run(async () => {
      const round = await c.undo.undo(); await c.session.load(); await navigate(resumePath(round));
    }),
  };
}
