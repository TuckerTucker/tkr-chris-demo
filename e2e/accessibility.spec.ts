import axe from 'axe-core';
import type { AxeResults } from 'axe-core';
import type { Page } from '@playwright/test';
import type { StoredRound } from '../src/storage';
import { expect, test } from './fixtures';

/** Audit the rendered document, including computed contrast, without disabling rules. */
async function accessible(page: Page, state: string): Promise<void> {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const engine = (window as unknown as { axe: { run(document: Document): Promise<AxeResults> } }).axe;
    const result = await engine.run(document);
    return result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
  });
  expect(violations, state).toEqual([]);
}

function round(id: string, count: 9 | 18, status: 'in-progress' | 'finished' = 'finished'): StoredRound {
  return { id, date: '2026-10-15', status, revision: 0, continuedTo18: count === 18,
    holes: Array.from({ length: count }, (_, index) => ({ number: index + 1, par: 4, strokes: 4, putts: 2, fairway: 'hit' })),
    drafts: {}, activeHole: null };
}

/** Native durable fixtures replace only score records; application reads and routes stay real. */
async function seed(page: Page, rounds: StoredRound[], route: string): Promise<void> {
  await page.evaluate(async (records) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('golf-scorecard');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('rounds', 'readwrite');
        const store = transaction.objectStore('rounds');
        store.clear();
        for (const record of records) store.put(record);
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onabort = () => { db.close(); reject(transaction.error); };
      };
    });
  }, rounds);
  // Start a new document: the previous editing session intentionally knows nothing
  // about fixture writes made by this independent native IndexedDB connection.
  await page.goto('about:blank');
  await page.goto(`/#${route}`);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`whole-screen accessibility across entry, completion and history in ${colorScheme}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme });
    await page.goto('/#/log');
    await expect(page.getByRole('heading', { name: 'Your scorecards will appear here' })).toBeVisible();
    await accessible(page, 'Empty history');
    await page.getByRole('button', { name: 'Start your first round' }).click();
    await expect(page.getByRole('button', { name: 'Start round', exact: true })).toBeVisible();
    await accessible(page, 'Start round');
    await page.getByRole('button', { name: 'Start round', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Hole 01' })).toBeVisible();
    await accessible(page, 'Par four with required fairway feedback');
    await page.getByRole('button', { name: 'Decrease Par', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Hit', exact: true })).toBeDisabled();
    await accessible(page, 'Par three with fairway disabled reason');
    await page.getByRole('button', { name: 'Decrease Strokes', exact: true }).click();
    await page.getByRole('button', { name: 'Decrease Strokes', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: 'Putts' })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
    await accessible(page, 'Persisted invalid putts with inline correction guidance');

    await seed(page, [round('accessible-nine', 9, 'in-progress')], '/round/turn');
    await expect(page.getByRole('heading', { name: 'The turn.' })).toBeVisible();
    await accessible(page, 'Turn with equally available nine/eighteen choices');
    await page.getByRole('button', { name: 'Finish — 9 holes' }).click();
    await expect(page.getByRole('heading', { name: 'Round complete.' })).toBeVisible();
    await accessible(page, 'Nine-hole summary');
    await seed(page, [round('accessible-nine', 9), round('accessible-eighteen', 18)], '/round/accessible-eighteen/summary');
    await expect(page.getByRole('heading', { name: 'Round complete.' })).toBeVisible();
    await page.getByRole('button', { name: 'Show holes 10–18' }).click();
    await expect(page.getByRole('rowheader', { name: '18', exact: true })).toBeVisible();
    await accessible(page, 'Expanded eighteen-hole summary');
    await page.getByRole('button', { name: 'Go to round log', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Finished rounds' }).getByRole('listitem')).toHaveCount(2);
    await accessible(page, 'Populated nine/eighteen history');
    await page.locator('a[href="#/log/accessible-nine"]').click();
    await expect(page.getByRole('button', { name: 'Edit hole 1', exact: true })).toBeVisible();
    await accessible(page, 'Finished round detail');
    await page.getByRole('button', { name: 'Edit hole 1', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Correct hole 01' })).toBeVisible();
    await accessible(page, 'Inline correction in semantic scorecard row');
    await page.getByRole('button', { name: 'Decrease Strokes', exact: true }).click();
    await page.getByRole('button', { name: 'Decrease Strokes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save correction', exact: true })).toBeDisabled();
    await accessible(page, 'Invalid inline correction');
    await page.getByRole('button', { name: 'Cancel correction', exact: true }).click();
    await page.getByRole('button', { name: 'Remove round', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Pending round removal' })).toBeVisible();
    await accessible(page, 'Persistent removed-round Undo');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Round complete.' })).toBeVisible();
    await expect(page.getByRole('row', { name: 'Total 36 36 18 9/9 9/9' })).toBeVisible();
  });
}

test('320px and 200% text preserve stepper geometry, native keyboard focus and scorecard scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ contrast: 'more', reducedMotion: 'reduce' });
  await page.goto('/#/round/start');
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hole 01' })).toBeVisible();
  await page.addStyleTag({ content: ':root { font-size: 200%; }' });
  expect(await page.evaluate(() => [matchMedia('(prefers-contrast: more)').matches,
    matchMedia('(prefers-reduced-motion: reduce)').matches])).toEqual([true, true]);
  for (const name of ['Par', 'Strokes', 'Putts']) {
    const bounds = await page.getByRole('spinbutton', { name, exact: true }).evaluate((value) => {
      const previous = value.previousElementSibling;
      const next = value.nextElementSibling;
      if (!previous || !next) throw new Error('Stepper must retain both increment controls.');
      const text = document.createRange(); text.selectNodeContents(value);
      return { minus: previous.getBoundingClientRect().toJSON(), value: value.getBoundingClientRect().toJSON(),
        plus: next.getBoundingClientRect().toJSON(), text: text.getBoundingClientRect().toJSON() };
    });
    for (const control of [bounds.minus, bounds.value, bounds.plus]) {
      expect(control.width, `${name} target width`).toBeGreaterThanOrEqual(48);
      expect(control.height, `${name} target height`).toBeGreaterThanOrEqual(48);
    }
    expect(bounds.minus.right).toBeLessThan(bounds.value.left);
    expect(bounds.value.right).toBeLessThan(bounds.plus.left);
    expect(bounds.text.left).toBeGreaterThanOrEqual(bounds.value.left);
    expect(bounds.text.right).toBeLessThanOrEqual(bounds.value.right);
    expect(bounds.plus.right).toBeLessThanOrEqual(320);
  }
  const visited: string[] = [];
  await page.getByRole('button', { name: 'Round log', exact: true }).focus();
  for (let step = 0; step < 20; step += 1) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement) || element === document.body) throw new Error('Keyboard left the form before Round options.');
      const bounds = element.getBoundingClientRect();
      const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      const labelId = element.getAttribute('aria-labelledby');
      return { label: element.getAttribute('aria-label') ?? (labelId ? document.getElementById(labelId)?.textContent : null) ?? element.textContent?.trim(),
        visible: hit === element || element.contains(hit), outline: getComputedStyle(element).outlineStyle };
    });
    expect(focus.visible, `Focused ${focus.label} must not be covered by actions`).toBe(true);
    expect(focus.outline, `Focused ${focus.label} has a visible outline`).not.toBe('none');
    visited.push(focus.label ?? '');
    if (focus.label === 'Round options') break;
  }
  expect(visited).toEqual(expect.arrayContaining(['Par', 'Strokes', 'Putts', 'Hit', 'Round options']));
  await accessible(page, 'Enlarged entry with high contrast and reduced motion');
  await seed(page, [round('wide-scorecard', 18)], '/round/wide-scorecard/summary');
  await expect(page.getByRole('heading', { name: 'Round complete.' })).toBeVisible();
  await page.addStyleTag({ content: ':root { font-size: 200%; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const scroll = page.locator('.kit-scorecard-scroll');
  await scroll.scrollIntoViewIfNeeded();
  await scroll.focus();
  await expect(scroll).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await accessible(page, 'Enlarged summary with keyboard-scrollable scorecard');
});

test('enlarged detail correction and persistent Undo remain accessible at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/#/log');
  await expect(page.getByRole('heading', { name: 'Your scorecards will appear here' })).toBeVisible();
  await seed(page, [round('narrow-detail', 9)], '/log/narrow-detail');
  await expect(page.getByRole('button', { name: 'Edit hole 1', exact: true })).toBeVisible();
  await page.addStyleTag({ content: ':root { font-size: 200%; }' });
  await page.getByRole('button', { name: 'Edit hole 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Correct hole 01' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const strokes = page.getByRole('spinbutton', { name: 'Strokes' });
  await strokes.focus();
  for (let increment = 0; increment < 6; increment += 1) await page.keyboard.press('ArrowUp');
  await expect(strokes).toHaveAttribute('aria-valuenow', '10');
  expect(await strokes.evaluate((element) => {
    const text = document.createRange(); text.selectNodeContents(element);
    const value = element.getBoundingClientRect();
    const glyphs = text.getBoundingClientRect();
    return glyphs.left >= value.left && glyphs.right <= value.right
      && glyphs.height <= parseFloat(getComputedStyle(element).lineHeight);
  }), 'A realistic two-digit score must remain on one line within its value box').toBe(true);
  const focused = await strokes.evaluate((element) => {
    const value = element.getBoundingClientRect();
    const hit = document.elementFromPoint(value.x + value.width / 2, value.y + value.height / 2);
    return hit === element || element.contains(hit);
  });
  expect(focused, 'Focused correction value must be visible within the scorecard viewport').toBe(true);
  for (const label of ['Par', 'Strokes', 'Putts']) {
    const controls = await page.getByRole('spinbutton', { name: label, exact: true }).evaluate((element) => {
      const range = document.createRange(); range.selectNodeContents(element);
      return [...element.parentElement?.children ?? []].map((control) => control.getBoundingClientRect().toJSON())
        .concat(range.getBoundingClientRect().toJSON());
    });
    for (const bounds of controls) {
      expect(bounds.width, `${label} control or value must not collapse`).toBeGreaterThan(0);
      expect(bounds.left, `${label} must fit the visible correction form`).toBeGreaterThanOrEqual(0);
      expect(bounds.right, `${label} must fit the visible correction form`).toBeLessThanOrEqual(320);
    }
  }
  for (const name of ['Save correction', 'Cancel correction']) {
    const button = page.getByRole('button', { name, exact: true });
    await button.focus();
    expect(await button.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return bounds.width >= 48 && bounds.height >= 48 && bounds.left >= 0 && bounds.right <= innerWidth
        && (hit === element || element.contains(hit));
    }), `${name} must remain fully reachable without horizontal panning`).toBe(true);
  }
  await accessible(page, 'Enlarged detail editor');
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Correct hole 01' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove round', exact: true }).click();
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  await expect(undo).toBeVisible();
  await accessible(page, 'Enlarged persistent Undo');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await undo.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Round complete.' })).toBeVisible();
  await expect(page.getByRole('row', { name: 'Total 36 42 18 8/9 9/9' })).toBeVisible();
});
