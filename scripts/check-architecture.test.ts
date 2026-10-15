import { describe, expect, it } from 'vitest';
import { checkBoundaries } from './check-architecture';

describe('architectural boundaries', () => {
  it.each([
    ['production rejects fixtures', 'src/app/container.ts', "import { db } from '../storage/__tests__/support';", 'test support'],
    ['pure domain rejects UI', 'src/domain/hole.ts', "import { Widget } from '../ui/kit';", 'pure-domain'],
    ['storage rejects app', 'src/storage/repo.ts', "import { c } from '../app/container';", 'application/UI'],
    ['external consumers use barrel', 'src/ui/entry/Hole.tsx', "import { Hole } from '../../domain/hole';", 'domain barrel'],
    ['application export is named', 'src/ui/entry/Hole.tsx', 'export default function Hole() {}', 'named'],
  ])('%s', (_name, filePath, text, diagnostic) => {
    expect(checkBoundaries([{ path: filePath, text }])).toEqual([expect.stringContaining(diagnostic)]);
  });
  it('accepts inward dependencies and ignores strings/comments', () => {
    expect(checkBoundaries([
      { path: 'src/domain/round.ts', text: "import type { Hole } from './hole';" },
      { path: 'src/storage/repo.ts', text: "import { validateHole } from '../domain/index';" },
      { path: 'src/ui/entry/Hole.tsx', text: "import { Hole } from '../../domain/index'; const text = 'export default';" },
    ])).toEqual([]);
  });
});
