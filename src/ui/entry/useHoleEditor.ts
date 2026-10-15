import { useRef, useState } from 'preact/hooks';
import { isGreenInRegulation, validateHoleDraft } from '../../domain';
import type { Hole, HoleDraft, HoleError } from '../../domain';

/** A draft cannot become a confirmed hole until every field is valid. */
export class HoleDraftValidationError extends Error {
  readonly errors: readonly HoleError[];
  constructor(errors: readonly HoleError[]) {
    super('Review the highlighted hole fields before confirming.');
    this.name = 'HoleDraftValidationError'; this.errors = errors;
  }
}

export interface HoleEditorState {
  readonly draft: HoleDraft;
  set<K extends keyof HoleDraft>(key: K, value: HoleDraft[K]): void;
  readonly errors: HoleError[];
  readonly gir: boolean | null;
  readonly canSave: boolean;
  toHole(): Hole;
}

/** Own one editor instance; asynchronous suggestions never replace entered values. */
export function useHoleEditor(opts: {
  holeNumber: number; initial?: HoleDraft; suggestedPar: number; onDraftChange(draft: HoleDraft): void;
}): HoleEditorState {
  const [draft, setDraft] = useState<HoleDraft>(() => opts.initial ? { ...opts.initial } : {
    number: opts.holeNumber, par: opts.suggestedPar, strokes: opts.suggestedPar, putts: 2,
    fairway: opts.suggestedPar === 3 ? 'n/a' : null,
  });
  const latest = useRef(draft);
  const errors = validateHoleDraft(draft);
  return {
    draft, errors, canSave: errors.length === 0,
    gir: errors.some((error) => ['par', 'strokes', 'putts'].includes(error.field)) ? null : isGreenInRegulation(draft),
    set(key, value): void {
      let next = { ...latest.current, [key]: value };
      if (key === 'par') {
        if (value === 3) next = { ...next, fairway: 'n/a' };
        else if (latest.current.par === 3) next = { ...next, fairway: null };
      }
      latest.current = next;
      setDraft(next);
      opts.onDraftChange(next);
    },
    toHole(): Hole {
      const failures = validateHoleDraft(latest.current);
      if (failures.length || latest.current.fairway === null) throw new HoleDraftValidationError(failures);
      return { ...latest.current, fairway: latest.current.fairway };
    },
  };
}
