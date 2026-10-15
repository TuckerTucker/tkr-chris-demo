import { expect, test } from './fixtures';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { preview } from 'vite';

test('serves one valid manifest and correctly sized install icons', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  const response = await request.get('/manifest.webmanifest');
  const manifest = await response.json() as {
    name: string; display: string; orientation: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };
  expect(manifest).toMatchObject({ name: 'Golf Scorecard', display: 'standalone', orientation: 'any' });
  expect(manifest.icons).toHaveLength(3);
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok()).toBe(true);
    const dimensions = await page.evaluate(async (src) => {
      const image = new Image(); image.src = src; await image.decode();
      return `${image.naturalWidth}x${image.naturalHeight}`;
    }, icon.src);
    expect(dimensions).toBe(icon.sizes);
  }
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
});

test('reopens the mounted application offline in the same isolated persistent context', async ({ playwright, browserName }, testInfo) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'scorecard-offline-'));
  const server = await preview({ configFile: false, preview: { host: '127.0.0.1', port: 0 }, build: { outDir: 'dist' } });
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Preview server did not bind a TCP port.');
  const origin = `http://127.0.0.1:${address.port}`;
  const context = await playwright[browserName].launchPersistentContext(directory, {
    headless: true,
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.use.isMobile,
    hasTouch: testInfo.project.use.hasTouch,
    userAgent: testInfo.project.use.userAgent,
  });
  let stopped = false;
  async function stopServer(): Promise<void> {
    if (stopped) return;
    stopped = true;
    const closing = new Promise<void>((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
    if ('closeAllConnections' in server.httpServer) server.httpServer.closeAllConnections();
    await closing;
  }
  try {
    const page = await context.newPage();
    await page.goto(origin);
    await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(origin);
    await expect(reopened.getByRole('heading', { name: 'Golf Scorecard', exact: true })).toBeVisible();
    await expect(reopened.getByText('Ready offline', { exact: true })).toBeVisible();
  } finally {
    await context.close();
    await stopServer();
    await rm(directory, { recursive: true, force: true });
  }
});
