import { test, expect } from './fixtures';

test('remembered consecutive par threes need one confirmation and native double click saves only one', async ({ page }) => {
  await page.goto('/#/round/start');
  await expect(page.getByRole('button', { name: 'Start round', exact: true })).toBeVisible();
  // Seed genuine remembered pars through IndexedDB, as earlier confirmed rounds would.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('golf-scorecard');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result; const tx = db.transaction('par-memory', 'readwrite');
        for (const holeNumber of [1, 2, 3]) tx.objectStore('par-memory').put({ holeNumber, par: 3 });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
  });
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Par' })).toHaveAttribute('aria-valuenow', '3');
  await expect(page.getByRole('button', { name: 'Confirm hole 1', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Confirm hole 1', exact: true }).dblclick();
  await expect(page.getByRole('heading', { name: 'Hole 02' })).toBeVisible();
  await expect(page.getByText('To par · 1 hole recorded')).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Hole 02' })).toBeVisible();
});

test('two tabs expose current and local drafts before explicit reapply', async ({ page, context }) => {
  await page.goto('/#/round/start'); await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await page.getByRole('button', { name: 'Increase Strokes', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  const other = await context.newPage(); await other.goto('/#/round/hole/1');
  await expect(other.getByRole('spinbutton', { name: 'Strokes' })).toHaveAttribute('aria-valuenow', '5');
  await other.getByRole('button', { name: 'Increase Strokes', exact: true }).click();
  await expect(other.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.bringToFront();
  await expect(page.getByRole('heading', { name: 'Review both versions' })).toBeVisible();
  await expect(page.locator('p').filter({ hasText: 'Your edits:' })).toContainText('5 strokes');
  await expect(page.locator('p').filter({ hasText: 'Saved version:' })).toContainText('6 strokes');
  await page.getByRole('button', { name: 'Reapply my edits' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Strokes' })).toHaveAttribute('aria-valuenow', '5');
  await expect(page.getByText('To par · 0 holes recorded')).toBeVisible();
  await page.getByRole('radio', { name: 'Hit', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm hole 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hole 02' })).toBeVisible();
  await other.close();
});

test('explicit fairway then confirm; invalid draft survives reload without entering totals', async ({ page }) => {
  await page.goto('/#/round/start'); await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hole 01' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm hole 1', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Green in regulation: Yes')).toBeVisible();
  await page.getByRole('radio', { name: 'Hit', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm hole 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hole 02' })).toBeVisible();
  await expect(page.getByText('To par · 1 hole recorded')).toBeVisible();
  await page.getByRole('button', { name: 'Decrease Strokes', exact: true }).click();
  await page.getByRole('button', { name: 'Decrease Strokes', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Putts' })).toHaveAttribute('aria-valuenow', '2');
  await expect(page.getByRole('button', { name: 'Confirm hole 2', exact: true })).toBeDisabled();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'Strokes' })).toHaveAttribute('aria-valuenow', '2');
  await expect(page.getByRole('spinbutton', { name: 'Putts' })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('To par · 1 hole recorded')).toBeVisible();
});

test('par changes preserve numbers, correction returns to next draft, future routes recover', async ({ page }) => {
  await page.goto('/#/round/start'); await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await page.getByRole('button', { name: 'Decrease Par', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Strokes' })).toHaveAttribute('aria-valuenow', '4');
  await expect(page.getByText('Not counted on par 3.')).toBeVisible();
  await page.getByRole('button', { name: 'Decrease Strokes', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm hole 1', exact: true }).click();
  await page.getByRole('button', { name: 'Increase Strokes', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hole 1', exact: true }).click();
  await page.getByRole('button', { name: 'Increase Strokes', exact: true }).click();
  await page.getByRole('button', { name: 'Save correction to hole 1' }).click();
  await expect(page.getByRole('heading', { name: 'Hole 02' })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Strokes' })).toHaveAttribute('aria-valuenow', '5');
  await page.goto('/#/round/hole/19');
  await expect(page.getByRole('heading', { name: 'This hole is not available' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume round', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hole 02' })).toBeVisible();
});

test('narrow viewport and enlarged text keep controls reachable by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#/round/start'); await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await page.addStyleTag({ content: ':root { font-size: 200%; }' });
  const strokes = page.getByRole('spinbutton', { name: 'Strokes' });
  await strokes.focus(); await page.keyboard.press('ArrowUp');
  await expect(strokes).toHaveAttribute('aria-valuenow', '5');
  await page.getByRole('radio', { name: 'Hit', exact: true }).click();
  const confirm = page.getByRole('button', { name: 'Confirm hole 1', exact: true });
  await confirm.scrollIntoViewIfNeeded(); await expect(confirm).toBeInViewport();
  const bounds = await confirm.boundingBox(); expect(bounds?.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await confirm.click(); await expect(page.getByRole('heading', { name: 'Hole 02' })).toBeVisible();
});
