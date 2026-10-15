import { test as isolatedTest, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Playwright creates and closes a fresh browser context for each test, isolating
 * IndexedDB, cookies, service workers and local storage without app backdoors.
 * Concurrency tests deliberately use context.newPage() to share origin storage.
 */
export const test = isolatedTest.extend<{ uncaughtErrors: undefined }>({
  uncaughtErrors: [async ({ context }, use) => {
    const errors: string[] = [];
    const capture = (error: Error): void => { errors.push(`${error.name}: ${error.message}`); };
    const attach = (page: Page): void => { page.on('pageerror', capture); };
    context.on('page', attach);
    for (const page of context.pages()) attach(page);
    await use(undefined);
    context.off('page', attach);
    for (const page of context.pages()) page.off('pageerror', capture);
    expect(errors, 'Every asynchronous application failure must be handled in place.').toEqual([]);
  }, { auto: true }],
});
export { expect };
