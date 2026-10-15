import axe from 'axe-core';
import type { AxeResults } from 'axe-core';
import { expect, test } from './fixtures';

test('footer theme overrides the device, persists with drafts and follows system changes when selected', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/#/round/start');
  const theme = page.getByRole('radiogroup', { name: 'Theme', exact: true });
  await expect(theme.getByRole('radio', { name: 'System', exact: true })).toHaveAttribute('aria-checked', 'true');
  const surface = (): Promise<string> => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--surface').trim());
  await expect.poll(surface).toBe('#000');
  await theme.getByRole('radio', { name: 'Light', exact: true }).click();
  await expect.poll(surface).toBe('#fff');
  await expect(page.getByRole('button', { name: 'Start round', exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await page.getByRole('button', { name: 'Increase Strokes', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(theme.getByRole('radio', { name: 'Light', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(surface).toBe('#fff');
  await expect(page.getByRole('spinbutton', { name: 'Strokes' })).toHaveAttribute('aria-valuenow', '5');

  const other = await context.newPage();
  await other.goto('/#/log');
  const otherTheme = other.getByRole('radiogroup', { name: 'Theme', exact: true });
  await expect(otherTheme.getByRole('radio', { name: 'Light', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.emulateMedia({ colorScheme: 'light', contrast: 'more' });
  await theme.getByRole('radio', { name: 'Light', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(theme.getByRole('radio', { name: 'Dark', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(surface).toBe('#000');
  await expect(otherTheme.getByRole('radio', { name: 'Dark', exact: true })).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ink-muted').trim())).toBe('#fff');
  await page.getByRole('radio', { name: 'Hit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm hole 1', exact: true })).toHaveCSS('color', 'rgb(0, 0, 0)');
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addStyleTag({ content: ':root { font-size: 200%; }' });
  for (const name of ['System', 'Light', 'Dark']) {
    const bounds = await theme.getByRole('radio', { name, exact: true }).boundingBox();
    if (!bounds) throw new Error(`The ${name} theme control must be visible.`);
    expect(bounds.width).toBeGreaterThanOrEqual(48);
    expect(bounds.height).toBeGreaterThanOrEqual(48);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  }
  await page.addScriptTag({ content: axe.source });
  expect(await page.evaluate(async () => {
    const engine = (window as unknown as { axe: { run(document: Document): Promise<AxeResults> } }).axe;
    return (await engine.run(document)).violations.map(({ id }) => id);
  })).toEqual([]);
  await theme.getByRole('radio', { name: 'System', exact: true }).click();
  await expect.poll(surface).toBe('#fff');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(surface).toBe('#000');
  await page.reload();
  await expect(theme.getByRole('radio', { name: 'System', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('spinbutton', { name: 'Strokes' })).toHaveAttribute('aria-valuenow', '5');
  await other.close();
});
