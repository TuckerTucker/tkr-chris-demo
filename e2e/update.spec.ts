import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { startStaticOrigin } from './static-server';
import type { StaticOrigin } from './static-server';
import type { StoredRound } from '../src/storage';

test.describe.configure({ mode: 'serial' });
let directory: string;
let firstBuild: string;
let secondBuild: string;

test.beforeAll(async () => {
  test.setTimeout(120000);
  directory = await mkdtemp(path.join(tmpdir(), 'scorecard-update-'));
  firstBuild = path.join(directory, 'a');
  secondBuild = path.join(directory, 'b');
  await build({ logLevel: 'silent', build: { outDir: firstBuild, emptyOutDir: true } });
  await build({ logLevel: 'silent', build: { outDir: secondBuild, emptyOutDir: true } });
  expect(await readFile(path.join(firstBuild, 'sw.js'), 'utf8')).not.toBe(await readFile(path.join(secondBuild, 'sw.js'), 'utf8'));
  // This real same-origin document is loaded before clientsClaim. It deliberately
  // has no application code, so the worker cannot receive a safety acknowledgement.
  await writeFile(path.join(firstBuild, 'silent.html'), '<!doctype html><html lang="en"><title>Silent client</title><body><h1>Silent client</h1></body></html>');
});

test.afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

function round(mode: 'active' | 'draft' | 'finished' | 'finished-draft'): StoredRound {
  const finished = mode.startsWith('finished');
  const hasDraft = mode === 'draft' || mode === 'finished-draft';
  const draftHole = finished ? 1 : 2;
  return {
    id: 'update-record', date: '2026-10-15', revision: 1, continuedTo18: false,
    status: finished ? 'finished' : 'in-progress',
    holes: Array.from({ length: finished ? 9 : 1 }, (_, index) => ({ number: index + 1, par: 4, strokes: 4, putts: 2, fairway: 'hit' as const })),
    drafts: hasDraft ? { [draftHole]: { number: draftHole, par: 4, strokes: 5, putts: 2, fairway: null } } : {},
    activeHole: hasDraft ? draftHole : finished ? null : 2,
  };
}

/** Native IndexedDB seeding exercises the production schema before product screens exist. */
async function seed(page: Page, value: StoredRound, pendingUndo = false): Promise<void> {
  await page.evaluate(async ({ value, pendingUndo }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('golf-scorecard');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['rounds', 'trash'], 'readwrite');
        transaction.objectStore('rounds').clear(); transaction.objectStore('trash').clear();
        transaction.objectStore('rounds').put(value);
        if (pendingUndo) transaction.objectStore('trash').put({ id: 'removed-record', token: 'update-removal-token', round: { ...value, id: 'removed-record' } });
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new Error('Seeding aborted'));
        transaction.onerror = () => reject(transaction.error ?? new Error('Seeding failed'));
      });
    } finally { database.close(); }
  }, { value, pendingUndo });
}

async function readStored(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('golf-scorecard');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const transaction = database.transaction('rounds');
        const request = transaction.objectStore('rounds').get('update-record');
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { database.close(); }
  });
}

async function ready(page: Page, origin: StaticOrigin): Promise<void> {
  await page.goto(origin.url);
  await expect(page.getByRole('heading', { name: 'Golf Scorecard', exact: true })).toBeVisible();
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

async function waiting(page: Page): Promise<void> {
  await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
  await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).waiting))).toBe(true);
}

async function cachesFor(page: Page): Promise<string[]> {
  return page.evaluate(async () => (await caches.keys()).filter((name) => name.startsWith('golf-scorecard-')).sort());
}

test('two builds preserve active/draft/undo state, retain live assets, and prune after the old tab closes', async ({ page, context }) => {
  test.setTimeout(90000);
  const origin = await startStaticOrigin(firstBuild);
  try {
    await ready(page, origin);
    const other = await context.newPage();
    await ready(other, origin);
    const firstScript = await page.locator('script[type="module"]').getAttribute('src');
    if (!firstScript) throw new Error('First build has no entry asset.');
    const originalCaches = await cachesFor(page);
    expect(originalCaches).toHaveLength(1);
    origin.serve(secondBuild);
    await waiting(page);

    for (const mode of ['active', 'draft', 'finished-draft', 'undo'] as const) {
      const value = round(mode === 'undo' ? 'finished' : mode);
      await seed(page, value, mode === 'undo');
      // Reloads still run the active A worker while B waits. Each real container
      // reads the durable state, with no product test hook or substitute storage.
      await ready(page, origin); await ready(other, origin);
      await expect(page.getByRole('button', { name: 'Update app', exact: true })).toHaveCount(0);
      // A stale client may still request activation. Exercise that actual worker
      // protocol defensively; successful activation below requires the visible UI.
      await page.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.postMessage({ type: 'GOLF_APPLY_UPDATE' }));
      await expect(page.getByText('Finish saved work in every open Scorecard tab, then try the update again.', { exact: true })).toBeVisible();
      expect(await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).waiting))).toBe(true);
      expect(await readStored(page)).toEqual(value);
      expect(await page.locator('script[type="module"]').getAttribute('src')).toBe(firstScript);
    }

    const saved = round('finished');
    await seed(page, saved); await ready(page, origin); await ready(other, origin);
    const otherDocument = await other.evaluate(() => performance.timeOrigin);
    await expect(page.getByRole('button', { name: 'Update app', exact: true })).toBeVisible();
    const reloaded = page.waitForEvent('load');
    await page.getByRole('button', { name: 'Update app', exact: true }).click();
    await reloaded;
    await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
    expect(await page.locator('script[type="module"]').getAttribute('src')).not.toBe(firstScript);
    expect(await other.evaluate(() => performance.timeOrigin)).toBe(otherDocument);
    expect(await other.locator('script[type="module"]').getAttribute('src')).toBe(firstScript);
    expect(await readStored(page)).toEqual(saved);
    const retained = await cachesFor(page);
    expect(retained).toHaveLength(2);
    expect(retained).toEqual(expect.arrayContaining(originalCaches));

    // Build B no longer serves A's hashed asset, so a successful request can
    // only come from retained application caches via the new active worker.
    expect((await context.request.get(new URL(firstScript, origin.url).href)).status()).toBe(404);
    expect(await other.evaluate(async (asset) => (await fetch(asset)).status, firstScript)).toBe(200);
    await other.close();
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => cachesFor(page)).toHaveLength(1);
    expect(await cachesFor(page)).not.toEqual(originalCaches);

    await context.setOffline(true); await page.close();
    const reopened = await context.newPage();
    await ready(reopened, origin);
    expect(await readStored(reopened)).toEqual(saved);
  } finally { await origin.stop(); }
});

test('a controlled silent client defers activation and releases mutation locks until explicit retry', async ({ page, context }) => {
  test.setTimeout(45000);
  const origin = await startStaticOrigin(firstBuild);
  try {
    const silent = await context.newPage();
    await silent.goto(`${origin.url}/silent.html`);
    await ready(page, origin);
    await expect.poll(() => silent.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    origin.serve(secondBuild);
    await waiting(page);
    await expect(page.getByRole('button', { name: 'Update app', exact: true })).toBeVisible();
    const originalDocument = await page.evaluate(() => performance.timeOrigin);
    await page.getByRole('button', { name: 'Update app', exact: true }).click();
    await expect(page.locator('fieldset.app-content')).toHaveAttribute('disabled', '');
    await expect(page.getByText('Finish saved work in every open Scorecard tab, then try the update again.', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('fieldset.app-content')).not.toHaveAttribute('disabled');
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(originalDocument);
    expect(await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).waiting))).toBe(true);
    await silent.close();
    const reloaded = page.waitForEvent('load');
    await page.getByRole('button', { name: 'Update app', exact: true }).click();
    await reloaded;
    await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
    expect(await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).waiting))).toBe(false);
  } finally { await origin.stop(); }
});
