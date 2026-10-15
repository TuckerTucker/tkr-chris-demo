/** Reader port implemented by storage and injected into the manual par source. */
export interface ParMemory {
  lastPar(holeNumber: number): Promise<number | undefined>;
}

/** Replaceable source for suggested par, including future course scorecards. */
export interface ParSource {
  suggestPar(holeNumber: number): Promise<number>;
}

/** Identifies invalid input or unsupported persisted par without coercion. */
export class ParValidationError extends Error {
  readonly field: 'holeNumber' | 'par';
  readonly value: unknown;

  constructor(field: 'holeNumber' | 'par', value: unknown) {
    super(field === 'holeNumber' ? 'Choose a hole from 1 to 18.' : 'The remembered par must be a whole number from 3 to 5.');
    this.name = 'ParValidationError';
    this.field = field;
    this.value = value;
  }
}

/** Suggests valid remembered par or four; read failures propagate to the caller. */
export function createManualParSource(memory: ParMemory): ParSource {
  return {
    async suggestPar(holeNumber: number): Promise<number> {
      if (!Number.isSafeInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
        throw new ParValidationError('holeNumber', holeNumber);
      }
      const par = await memory.lastPar(holeNumber);
      if (par === undefined) return 4;
      if (!Number.isSafeInteger(par) || par < 3 || par > 5) {
        throw new ParValidationError('par', par);
      }
      return par;
    },
  };
}
