import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Container } from '../../app/container';
import { roundTotals } from '../../domain';
import type { RoundTotals } from '../../domain';
import { toStorageError } from '../../storage';
import type { StorageError, StoredRound } from '../../storage';

export interface RoundListItem { readonly round: StoredRound; readonly totals: RoundTotals }
export interface RoundListState {
  readonly inProgress: RoundListItem | null;
  readonly finished: readonly RoundListItem[];
  readonly loading: boolean;
  readonly error: StorageError | null;
  reload(): Promise<void>;
}

/** Re-read committed scores on focus and commits, preserving visible results while refreshing. */
export function useRoundList(c: Container): RoundListState {
  const [state, setState] = useState<Omit<RoundListState, 'reload'>>({ inProgress: null, finished: [], loading: true, error: null });
  const generation = useRef(0);
  const mounted = useRef(true);
  const reload = useCallback(async (): Promise<void> => {
    const request = ++generation.current;
    setState((current) => ({ ...current, loading: true }));
    try {
      const [active, finished] = await Promise.all([c.repository.getInProgress(), c.repository.listFinished()]);
      if (!mounted.current || request !== generation.current) return;
      const item = (round: StoredRound): RoundListItem => ({ round, totals: roundTotals(round.holes) });
      setState({ inProgress: active ? item(active) : null, finished: finished.map(item), loading: false, error: null });
    } catch (error) {
      if (!mounted.current || request !== generation.current) return;
      const typed = toStorageError(error);
      c.logger.error({ event: 'storage.error', kind: typed.kind });
      setState((current) => ({ ...current, loading: false, error: typed }));
    }
  }, [c]);
  useEffect(() => {
    mounted.current = true;
    const refresh = (): void => { void reload(); };
    const unsubscribe = c.subscribe(refresh);
    window.addEventListener('focus', refresh);
    refresh();
    return () => { mounted.current = false; generation.current += 1; unsubscribe(); window.removeEventListener('focus', refresh); };
  }, [c, reload]);
  return { ...state, reload };
}
