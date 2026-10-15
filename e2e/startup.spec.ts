import { expect, test } from './fixtures';

test('startup storage errors retain data and offer an actionable retry', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('golf-scorecard');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('rounds', 'readwrite');
        tx.objectStore('rounds').put({ id: 'unreadable-example', status: 'invalid' });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Storage initialization' })).toBeVisible();
  await expect(page.getByText('Stored scorecard data could not be read safely.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Retry opening storage' }).click();
  await expect(page.getByRole('button', { name: 'Retry opening storage' })).toBeEnabled();
  expect(await page.evaluate(async () => new Promise<boolean>((resolve, reject) => {
    const opening = indexedDB.open('golf-scorecard');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result; const tx = db.transaction('rounds');
      const request = tx.objectStore('rounds').get('unreadable-example');
      let exists = false; request.onsuccess = () => { exists = Boolean(request.result); };
      tx.oncomplete = () => { db.close(); resolve(exists); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }))).toBe(true);
});
