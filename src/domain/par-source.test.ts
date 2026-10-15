import { expect, test } from 'vitest';
import { createManualParSource, ParValidationError } from './index';
import type { ParMemory, ParSource } from './index';

class InMemoryParMemory implements ParMemory {
  readonly reads: number[] = [];
  constructor(private readonly entries = new Map<number, number>()) {}
  async lastPar(holeNumber: number): Promise<number | undefined> {
    this.reads.push(holeNumber);
    return this.entries.get(holeNumber);
  }
}

test.each([3, 4, 5])('suggests remembered par %s through the injected port', async (par) => {
  const memory = new InMemoryParMemory(new Map([[18, par]]));
  const source: ParSource = createManualParSource(memory);
  await expect(source.suggestPar(18)).resolves.toBe(par);
  expect(memory.reads).toEqual([18]);
});

test('defaults unknown hole to four', async () => {
  await expect(createManualParSource(new InMemoryParMemory()).suggestPar(1)).resolves.toBe(4);
});

test.each([0, 19, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null, undefined, {}])(
  'invalid requested hole %s fails before reading memory', async (number) => {
    const memory = new InMemoryParMemory();
    await expect(createManualParSource(memory).suggestPar(number as number)).rejects.toMatchObject({
      name: 'ParValidationError', field: 'holeNumber', value: number,
    });
    expect(memory.reads).toEqual([]);
  },
);

test.each([0, 2, 6, 3.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '4', null, {}])(
  'invalid remembered par %s surfaces typed validation failure', async (par) => {
    const memory = new InMemoryParMemory(new Map([[1, par as number]]));
    await expect(createManualParSource(memory).suggestPar(1)).rejects.toBeInstanceOf(ParValidationError);
    await expect(createManualParSource(memory).suggestPar(1)).rejects.toMatchObject({ field: 'par', value: par });
  },
);

test('memory read errors retain identity and cause', async () => {
  const failure = new Error('The local database is unavailable.', { cause: 'blocked' });
  const memory: ParMemory = {
    async lastPar(): Promise<number | undefined> { throw failure; },
  };
  await expect(createManualParSource(memory).suggestPar(1)).rejects.toBe(failure);
});
