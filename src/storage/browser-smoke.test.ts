import { expect, test } from 'vitest';

test('a real IndexedDB store persists and reads a record', async () => {
  const name = `tooling-smoke-${crypto.randomUUID()}`;
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Opening IndexedDB failed'));
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('records', 'readwrite');
      transaction.objectStore('records').put({ strokes: 4 }, 'hole-1');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Writing IndexedDB failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Writing IndexedDB aborted'));
    });
    const record = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction('records');
      const request = transaction.objectStore('records').get('hole-1');
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? new Error('Reading IndexedDB failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Reading IndexedDB aborted'));
    });
    expect(record).toEqual({ strokes: 4 });
  } finally {
    database.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Deleting IndexedDB failed'));
      request.onblocked = () => reject(new Error('The tooling database still has an open connection'));
    });
  }
});
