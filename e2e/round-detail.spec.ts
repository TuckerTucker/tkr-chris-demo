import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function seed(page: Page): Promise<void> {
  await page.goto('/#/log');
  await expect(page.getByRole('heading', { name: 'Rounds', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('golf-scorecard');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result; const tx = db.transaction('rounds', 'readwrite');
        for (const id of ['detail-nine', 'other-nine']) tx.objectStore('rounds').put({
          id, date: id === 'detail-nine' ? '2026-10-15' : '2026-10-10', revision: 0, status: 'finished', continuedTo18: false,
          holes: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, strokes: 4, putts: 2, fairway: 'hit' })),
          drafts: {}, activeHole: null,
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
  });
  await page.goto('/#/log/detail-nine');
  await expect(page.getByRole('button', { name: 'Edit hole 1', exact: true })).toBeVisible();
}

async function durableRound(page: Page, id = 'detail-nine'): Promise<unknown> {
  return await page.evaluate(async (roundId) => await new Promise<unknown>((resolve, reject) => {
    const open = indexedDB.open('golf-scorecard');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result; const tx = db.transaction('rounds', 'readonly');
      const request = tx.objectStore('rounds').get(roundId);
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), id);
}

test('inline correction drafts survive navigation and restart; Cancel and Save preserve distinct meanings', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Edit hole 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Correct hole 01' })).toBeFocused();
  await page.getByRole('button', { name: 'Increase Strokes' }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await expect(page.getByRole('row', { name: 'Total 36 36 18 9/9 9/9' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to rounds' }).click();
  await page.getByRole('list', { name: 'Finished rounds' }).getByRole('link').first().click();
  await expect(page.getByRole('spinbutton', { name: 'Strokes' })).toHaveAttribute('aria-valuenow', '5');
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'Strokes' })).toHaveAttribute('aria-valuenow', '5');
  await page.getByRole('button', { name: 'Cancel correction', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit hole 1', exact: true })).toBeFocused();
  await expect(page.getByRole('row', { name: 'Total 36 36 18 9/9 9/9' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit hole 1', exact: true }).click();
  await page.getByRole('button', { name: 'Increase Par' }).click();
  await page.getByRole('button', { name: 'Increase Strokes' }).click();
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(page.getByRole('row', { name: 'Total 37 37 18 9/9 9/9' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit hole 1', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Back to rounds' }).click();
  await expect(page.getByRole('list', { name: 'Finished rounds' }).getByRole('listitem').first()).toContainText('37');
});

test('removal, restart and global Undo restore every saved field; another removal requires explicit dismissal', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Edit hole 3', exact: true }).click();
  await page.getByRole('button', { name: 'Decrease Strokes' }).click();
  await page.getByRole('button', { name: 'Decrease Strokes' }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  const before = await durableRound(page);
  await page.getByRole('button', { name: 'Remove round', exact: true }).click();
  await expect(page).toHaveURL(/#\/log$/);
  await page.goto('/#/log/other-nine');
  await expect(page.getByRole('button', { name: 'Remove round', exact: true })).toBeDisabled();
  await expect(page.getByText('Undo or dismiss the removed round before removing another.')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page).toHaveURL(/#\/log\/detail-nine$/);
  await expect(page.getByRole('heading', { name: 'Correct hole 03' })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Strokes' })).toHaveAttribute('aria-valuenow', '2');
  const after = await durableRound(page);
  // Undo advances only the optimistic concurrency revision.
  expect({ ...(after as object), revision: 0 }).toEqual({ ...(before as object), revision: 0 });
  await page.getByRole('button', { name: 'Remove round', exact: true }).click();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pending round removal' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Pending round removal' })).toHaveCount(0);
  expect(await durableRound(page)).toBeUndefined();
});

test('concurrent tabs compare saved and local correction drafts before explicit reapply', async ({ page, context }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Edit hole 1', exact: true }).click();
  await page.getByRole('button', { name: 'Increase Strokes' }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  const other = await context.newPage(); await other.goto('/#/log/detail-nine');
  await expect(other.getByRole('spinbutton', { name: 'Strokes' })).toHaveAttribute('aria-valuenow', '5');
  await other.getByRole('button', { name: 'Increase Strokes' }).click();
  await other.getByRole('button', { name: 'Increase Strokes' }).click();
  await expect(other.getByText('Saved on this device', { exact: true })).toBeVisible();
  const conflict = page.getByRole('region', { name: 'Review conflicting edits' });
  await expect(conflict).toContainText('5 strokes');
  await expect(conflict).toContainText('7 strokes');
  await page.getByRole('button', { name: 'Reapply my edits' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Strokes' })).toHaveAttribute('aria-valuenow', '5');
  await expect(page.getByRole('row', { name: 'Total 36 36 18 9/9 9/9' })).toBeVisible();
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(page.getByRole('row', { name: 'Total 36 37 18 8/9 9/9' })).toBeVisible();
  await expect(other.getByRole('region', { name: 'Review conflicting edits' })).toBeVisible();
  await other.getByRole('button', { name: 'Use saved version' }).click();
  await expect(other.getByRole('row', { name: 'Total 36 37 18 8/9 9/9' })).toBeVisible();
  await other.close();
});

test('complete offline round can restart and persist a correction while still offline', async ({ page, context }) => {
  await page.goto('/#/round/start'); await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  for (let n = 1; n <= 9; n += 1) {
    await expect(page.getByRole('heading', { name: `Hole ${String(n).padStart(2, '0')}`, exact: true })).toBeVisible();
    await page.getByRole('radio', { name: 'Hit', exact: true }).click();
    await page.getByRole('button', { name: `Confirm hole ${n}`, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Finish — 9 holes' }).click();
  await expect(page.getByRole('heading', { name: 'Round complete.' })).toBeVisible();
  const origin = new URL(page.url()).origin; await page.close();
  const reopened = await context.newPage(); await reopened.goto(`${origin}/#/log`);
  await reopened.getByRole('list', { name: 'Finished rounds' }).getByRole('link').click();
  await reopened.getByRole('button', { name: 'Edit hole 9', exact: true }).click();
  await reopened.getByRole('button', { name: 'Increase Strokes' }).click();
  await expect(reopened.getByText('Saved on this device', { exact: true })).toBeVisible();
  await reopened.reload();
  await expect(reopened.getByRole('spinbutton', { name: 'Strokes' })).toHaveAttribute('aria-valuenow', '5');
  await reopened.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(reopened.getByRole('row', { name: 'Total 36 37 18 8/9 9/9' })).toBeVisible();
  await reopened.reload();
  await expect(reopened.getByRole('row', { name: 'Total 36 37 18 8/9 9/9' })).toBeVisible();
});

test('an unknown detail id has an inline recovery route and never shows a fabricated card', async ({ page }) => {
  await page.goto('/#/log/missing');
  await expect(page.getByRole('heading', { name: 'Round unavailable' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry saving' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Scorecard' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to rounds' }).click();
  await expect(page.getByRole('heading', { name: 'Rounds', exact: true })).toBeVisible();
});
