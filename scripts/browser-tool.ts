import { access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// Configure before loading Playwright: its registry reads this during import.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(tmpdir(), 'golf-scorecard-browsers');
const mode = process.argv[2];
if (!['install', 'browser', 'e2e'].includes(mode ?? '')) throw new Error('Expected install, browser or e2e.');

if (mode !== 'install') {
  const { chromium, webkit } = await import('playwright');
  try {
    await access(chromium.executablePath());
    if (mode === 'e2e') await access(webkit.executablePath());
  } catch {
    process.stderr.write('Browser binaries are missing. Run npm run setup:browsers before testing.\n');
    process.exit(1);
  }
}

const cli = mode === 'browser'
  ? new URL('vitest.mjs', import.meta.resolve('vitest/package.json'))
  : new URL('cli.js', import.meta.resolve('playwright/package.json'));
const args = mode === 'install' ? ['install', 'chromium', 'webkit']
  : mode === 'browser' ? ['run', '--project', 'browser'] : ['test'];
const child = spawn(process.execPath, [fileURLToPath(cli), ...args, ...process.argv.slice(3)], {
  stdio: 'inherit', env: process.env,
});
child.on('error', (error) => {
  process.stderr.write(`Unable to start browser tooling: ${error.message}\n`);
  process.exitCode = 1;
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
