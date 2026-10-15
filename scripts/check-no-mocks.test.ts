import { expect, test } from 'vitest';
import { findMocks } from './check-no-mocks';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const forbidden = [
  'vi.mock("dependency")',
  'vi.doMock("dependency")',
  'vi.spyOn(target, "method")',
  'vi.fn()',
  'jest.mock("dependency")',
  'jest.doMock("dependency")',
  'jest.spyOn(target, "method")',
  'jest.fn()',
  'mock.module("dependency")',
  'import { vi as tools } from "vitest"; tools.mock("dependency")',
  'import { vitest as tools } from "vitest"; tools.doMock("dependency")',
  'import * as tools from "vitest"; tools.vi.spyOn(target, "method")',
  'import { jest as tools } from "@jest/globals"; tools.mock("dependency")',
  'import { mock as tools } from "node:test"; tools.module("dependency")',
  'import { mock as m } from "bun:test"; m.module("dependency")',
  'import * as bun from "bun:test"; bun.mock.module("dependency")',
  'import { vi } from "vitest"; const { spyOn: spy } = vi; spy(target, "method")',
  'import { vi } from "vitest"; const alias = vi; const mocker = alias.doMock; mocker("dependency")',
  'const { mock: tools } = require("node:test"); tools.module("dependency")',
  'vi["mock"]("dependency")',
  'vi?.mock("dependency")',
  ...['setMock', 'unstable_mockModule', 'createMockFromModule', 'stubGlobal', 'stubEnv']
    .map((method) => `jest.${method}("dependency")`),
  ...['fn', 'method', 'getter', 'setter'].map((method) => `mock.${method}(target, "method")`),
];

test.each(forbidden)('rejects executable mocking: %s', (text) => {
  expect(findMocks([{ path: 'src/helpers/setup.ts', text }])).toHaveLength(1);
});

test('reports the source location and called alias', () => {
  expect(findMocks([{ path: 'e2e/helper.ts', text: '\nimport { vi as tool } from "vitest";\ntool.mock("x");' }]))
    .toEqual([{ path: 'e2e/helper.ts', line: 3, construct: 'tool.mock' }]);
});

test('allows strings, comments, regular collaborators and type-only usage', () => {
  const text = `
    // vi.mock('not executable')
    /* jest.spyOn(target, 'method') */
    const fixture = "vi.mock('literal')";
    const template = \`mock.module('data')\`;
    interface Port { mock(): void }
    function usePort(vi: Port) { vi.mock(); }
    const object = { mock() {} }; object.mock();
  `;
  expect(findMocks([{ path: 'scripts/fixtures.ts', text }])).toEqual([]);
});

test('rejects executable calls inside template interpolation', () => {
  expect(findMocks([{ path: 'e2e/helper.ts', text: 'const output = `value ${vi.mock("x")}`;' }])).toHaveLength(1);
});

test('CLI exits nonzero for an executable mocking call in a helper', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'no-mocks-guard-'));
  try {
    await mkdir(path.join(directory, 'src', 'helpers'), { recursive: true });
    await writeFile(path.join(directory, 'src', 'helpers', 'setup.ts'), 'vi.mock("dependency");\n');
    await expect(promisify(execFile)(process.execPath, [
      '--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./check-no-mocks.ts', import.meta.url)),
    ], { cwd: directory })).rejects.toMatchObject({ code: 1, stderr: 'src/helpers/setup.ts:1 vi.mock\n' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
