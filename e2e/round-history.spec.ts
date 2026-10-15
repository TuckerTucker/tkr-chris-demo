import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function seed(page: Page): Promise<void> {
  await page.goto('/#/log');
  await expect(page.getByRole('heading', { name: 'Rounds', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const opening = indexedDB.open('golf-scorecard');
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const tx = db.transaction('rounds', 'readwrite');
        for (const [id, date, count, status] of [
          ['older-eighteen', '2026-10-10', 18, 'finished'], ['newer-nine', '2026-10-15', 9, 'finished'],
          ['active-round', '2026-10-16', 2, 'in-progress'],
        ] as const) {
          const holes = Array.from({ length: count }, (_, i) => ({ number: i + 1, par: 4, strokes: 4, putts: 2, fairway: 'hit' }));
          tx.objectStore('rounds').put({ id, date, holes, revision: 0, continuedTo18: count === 18,
            status, drafts: {}, activeHole: status === 'finished' ? null : 3 });
        }
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
  });
  await page.reload();
}

test('empty log offers a clear first-round action and opens the start screen', async ({ page }) => {
  await page.goto('/#/log');
  await expect(page.getByRole('heading', { name: 'Your scorecards will appear here' })).toBeVisible();
  await page.getByRole('button', { name: 'Start your first round' }).click();
  await expect(page).toHaveURL(/#\/round\/start$/);
  await expect(page.getByRole('button', { name: 'Start round', exact: true })).toBeVisible();
});

test('history lists 9 and 18 holes newest first, pins active round and resumes its cursor', async ({ page }) => {
  await seed(page);
  const rows = page.getByRole('list', { name: 'Finished rounds' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('9 holes');
  await expect(rows.nth(0)).toContainText('36');
  await expect(rows.nth(0)).toContainText('9/9');
  await expect(rows.nth(1)).toContainText('18 holes');
  await expect(rows.nth(1)).toContainText('72');
  await expect(rows.nth(1)).toContainText('18/18');
  const active = page.getByRole('article', { name: 'Round in progress' });
  await expect(active).toContainText('Hole 03');
  await expect(active).not.toContainText('of 18');
  await expect(page.getByRole('button', { name: 'New round', exact: true })).toBeDisabled();
  await expect(page.locator('#new-round-reason')).toHaveText('Round in progress');
  await active.getByRole('button', { name: 'Resume' }).click();
  await expect(page).toHaveURL(/#\/round\/hole\/3$/);
});

test('an abandoned round reserves New round until the persistent undo is dismissed', async ({ page }) => {
  await page.goto('/#/round/start');
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await page.getByText('Round options', { exact: true }).click();
  await page.getByRole('button', { name: 'Abandon round', exact: true }).click();
  await expect(page).toHaveURL(/#\/log$/);
  await expect(page.getByRole('button', { name: 'New round', exact: true })).toBeDisabled();
  await expect(page.locator('#new-round-reason')).toContainText('Undo or dismiss');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Pending round removal' })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(page.getByRole('button', { name: 'New round', exact: true })).toBeEnabled();
});
