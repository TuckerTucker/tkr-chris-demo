import { useState } from 'preact/hooks';
import type { Container } from '../../app/container';
import { useSnapshot } from '../../app/hooks';
import { navigate } from '../../app/router';
import { roundTotals } from '../../domain';
import { toStorageError } from '../../storage';
import type { StorageError } from '../../storage';
import type { SessionController, SessionSnapshot } from '../../app/session';
import type { RoundTotals } from '../../domain';

export interface RoundSession extends SessionSnapshot {
  readonly controller: SessionController;
  readonly totals: RoundTotals;
  readonly currentHole: number;
  start: SessionController['start'];
  save: SessionController['save'];
  correct: SessionController['correct'];
  saveDraft: SessionController['saveDraft'];
  retry: SessionController['retry'];
  goTo(number: number): void;
}

/** Subscribe to the app's one writer; never recreate storage on a route change. */
export function useRoundSession(c: Container): RoundSession {
  const snapshot = useSnapshot(c.session);
  const [navigationError, setNavigationError] = useState<StorageError | null>(null);
  const match = /^#\/round\/hole\/(\d+)$/.exec(window.location.hash);
  const routeHole = match ? Number(match[1]) : null;
  return {
    ...snapshot, error: snapshot.error ?? navigationError, controller: c.session,
    totals: roundTotals(snapshot.round?.holes ?? []),
    currentHole: routeHole ?? snapshot.round?.activeHole ?? (snapshot.round?.holes.length ?? 0) + 1,
    start: () => c.session.start(), save: (hole) => c.session.save(hole), correct: (hole) => c.session.correct(hole),
    saveDraft: (draft) => c.session.saveDraft(draft), retry: () => c.session.retry(),
    goTo(number): void {
      void navigate(`/round/hole/${number}`).then(() => setNavigationError(null), (error: unknown) => setNavigationError(toStorageError(error)));
    },
  };
}
