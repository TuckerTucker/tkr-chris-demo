import { expect, test } from './fixtures';

test('mounts the Golf Scorecard application', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Golf Scorecard', exact: true })).toBeVisible();
});
