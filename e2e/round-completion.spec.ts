import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

async function start(page: Page): Promise<void> {
  await page.goto('/#/round/start'); await page.getByRole('button', { name: 'Start round', exact: true }).click();
}
async function playHoles(page: Page, from: number, to: number): Promise<void> {
  for (let number = from; number <= to; number += 1) {
    await expect(page.getByRole('heading', { name: `Hole ${String(number).padStart(2, '0')}`, exact: true })).toBeVisible();
    await page.getByRole('radio', { name: 'Hit', exact: true }).click();
    await page.getByRole('button', { name: `Confirm hole ${number}`, exact: true }).click();
  }
}

test('nine-hole turn, recoverable corrections and starting again without a reload', async ({ page }) => {
  await start(page); await playHoles(page, 1, 9);
  await expect(page.getByRole('heading', { name: 'The turn.' })).toBeVisible(); await page.reload();
  await expect(page.getByRole('heading', { name: 'The turn.' })).toBeVisible();
  await page.getByText('Review recorded holes', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hole 10, not yet available', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Hole 1', exact: true }).click();
  await page.getByRole('button', { name: 'Increase Strokes', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.goto('/#/round/turn');
  await expect(page.getByRole('button', { name: 'Finish — 9 holes' })).toBeDisabled();
  await page.getByRole('button', { name: 'Review correction to hole 1' }).click();
  await page.getByRole('button', { name: 'Save correction to hole 1' }).click();
  await page.getByRole('button', { name: 'Finish — 9 holes' }).click();
  await expect(page.getByRole('heading', { name: 'Round complete.' })).toBeVisible();
  await expect(page.getByText('9 holes', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('row', { name: 'Total 36 37 18 8/9 9/9' })).toBeVisible();
  await page.getByRole('button', { name: 'Start another round' }).click();
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hole 01' })).toBeVisible();
  await expect(page.getByText('To par · 0 holes recorded')).toBeVisible();
});

test('continue persists through restart, eighteen commits its summary, and full scorecard expands', async ({ page }) => {
  await start(page); await playHoles(page, 1, 9);
  await page.getByRole('button', { name: 'Play the back nine' }).click();
  await expect(page.getByRole('heading', { name: 'Hole 10' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hole 10' })).toBeVisible();
  await playHoles(page, 10, 17);
  const current = page.getByRole('button', { name: 'Hole 18', exact: true });
  await expect(current).toBeInViewport();
  await playHoles(page, 18, 18);
  await expect(page.getByRole('heading', { name: 'Round complete.' })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Round complete.' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: '10', exact: true })).toBeHidden();
  await expect(page.getByRole('row', { name: 'Out 36 36 18 9/9 9/9' })).toBeVisible();
  await expect(page.getByRole('row', { name: 'In 36 36 18 9/9 9/9' })).toBeVisible();
  await page.getByRole('button', { name: 'Show holes 10–18' }).click();
  await expect(page.getByRole('row', { name: 'Out 36 36 18 9/9 9/9' })).toBeVisible();
  await expect(page.getByRole('row', { name: 'In 36 36 18 9/9 9/9' })).toBeVisible();
  await expect(page.getByRole('row', { name: 'Total 72 72 36 18/18 18/18' })).toBeVisible();
});

test('abandon, navigate, restart and undo preserve scores and invalid drafts; dismiss frees new round', async ({ page }) => {
  await start(page); await playHoles(page, 1, 1);
  await page.getByRole('button', { name: 'Decrease Strokes', exact: true }).click();
  await page.getByRole('button', { name: 'Decrease Strokes', exact: true }).click();
  await page.getByText('Round options', { exact: true }).click();
  await page.getByRole('button', { name: 'Abandon round', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await page.reload(); await page.goto('/#/round/start');
  await expect(page.getByRole('button', { name: 'Start round', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hole 02' })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Strokes' })).toHaveAttribute('aria-valuenow', '2');
  await expect(page.getByRole('spinbutton', { name: 'Putts' })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('To par · 1 hole recorded')).toBeVisible();
  await page.getByText('Round options', { exact: true }).click();
  await page.getByRole('button', { name: 'Abandon round', exact: true }).click();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await page.goto('/#/round/start'); await expect(page.getByRole('button', { name: 'Start round', exact: true })).toBeEnabled();
});

test('a complete offline round survives closing and reopening its finished summary', async ({ page, context }) => {
  await page.goto('/#/round/start'); await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Start round', exact: true }).click(); await playHoles(page, 1, 9);
  await page.getByRole('button', { name: 'Finish — 9 holes' }).click();
  await expect(page.getByRole('heading', { name: 'Round complete.' })).toBeVisible();
  const url = page.url(); await page.close();
  const reopened = await context.newPage(); await reopened.goto(url);
  await expect(reopened.getByRole('heading', { name: 'Round complete.' })).toBeVisible();
  await expect(reopened.getByRole('row', { name: 'Total 36 36 18 9/9 9/9' })).toBeVisible();
});
