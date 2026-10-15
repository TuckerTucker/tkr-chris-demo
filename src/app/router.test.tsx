import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { deleteDB } from 'idb';
import { buildContainer, ContainerContext } from './container';
import type { Container } from './container';
import { createLogger } from './logger';
import { navigate, resumePath, Router, startupPath } from './router';
import type { RouteDef } from './router';
import { hole } from '../storage/__tests__/support';

let c: Container | undefined;
let name: string;
async function setup(): Promise<Container> {
  name = `router-${crypto.randomUUID()}`;
  c = await buildContainer({ dbName: name, logger: createLogger({ level: 'fatal' }), today: () => '2026-10-15' });
  window.history.replaceState(null, '', window.location.pathname);
  return c;
}
afterEach(async () => { cleanup(); c?.close(); if (name) await deleteDB(name); window.history.replaceState(null, '', window.location.pathname); });

test('startup and resume derive draft, turn, continued, finish and finished destinations', async () => {
  const c = await setup();
  expect(await startupPath(c)).toBe('/log');
  let round = await c.repository.createRound(c.today());
  expect(resumePath(round)).toBe('/round/hole/1');
  round = await c.repository.saveDraft(round.id, { ...hole(1), fairway: null }, round.revision);
  expect(await startupPath(c)).toBe('/round/hole/1');
  for (let n = 1; n <= 9; n += 1) round = await c.repository.saveHole(round.id, hole(n), round.revision);
  expect(resumePath(round)).toBe('/round/turn');
  round = await c.repository.continueRound(round.id, round.revision);
  expect(resumePath(round)).toBe('/round/hole/10');
  for (let n = 10; n <= 18; n += 1) round = await c.repository.saveHole(round.id, hole(n), round.revision);
  expect(resumePath(round)).toBe('/round/finish');
  round = await c.repository.finishRound(round.id, round.revision);
  expect(resumePath(round)).toBe(`/round/${round.id}/summary`);
  round = await c.repository.saveDraft(round.id, { ...hole(2), putts: 1 }, round.revision);
  expect(resumePath(round)).toBe(`/log/${round.id}`);
  window.history.replaceState(null, '', '#/log/explicit');
  expect(await startupPath(c)).toBe('/log/explicit');
});

test('injected route views navigate without reload and handle malformed and missing paths', async () => {
  const c = await setup();
  const views: RouteDef[] = [{ path: '/log', view: () => <h2>Test log</h2> },
    { path: '/test/:id', view: ({ params }) => <h2>Item {params.id}</h2> }];
  render(<ContainerContext.Provider value={c}><Router routes={views} /></ContainerContext.Provider>);
  expect(screen.getByText('Test log')).toBeTruthy();
  await navigate('/test/a%20b');
  await waitFor(() => expect(screen.getByText('Item a b')).toBeTruthy());
  await navigate('/test/%zz');
  await waitFor(() => expect(screen.getByText('Not found')).toBeTruthy());
});

test('startup respects navigation while the native storage read is pending', async () => {
  const c = await setup();
  await c.repository.createRound(c.today());
  const destination = startupPath(c);
  window.history.replaceState(null, '', '#/round/start');
  expect(await destination).toBe('/round/start');
});

test('native hash navigation immediately after mounting reaches the requested view', async () => {
  const c = await setup();
  render(<ContainerContext.Provider value={c}><Router routes={[
    { path: '/log', view: () => <h2>Test log</h2> },
    { path: '/round/start', view: () => <h2>Requested start</h2> },
  ]} /></ContainerContext.Provider>);
  window.location.hash = '/round/start';
  await waitFor(() => expect(screen.getByText('Requested start')).toBeTruthy());
});

test('navigation flush failure preserves the prior route and shows the error', async () => {
  const real = await setup();
  const c: Container = { ...real, async flush(): Promise<void> { throw new Error('Retained unsaved change'); } };
  render(<ContainerContext.Provider value={c}><Router routes={[{ path: '/log', view: () => <h2>Still editing</h2> }]} /></ContainerContext.Provider>);
  await expect(navigate('/test/1')).rejects.toThrow('Retained unsaved change');
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Retained unsaved change'));
  expect(screen.getByText('Still editing')).toBeTruthy();
  expect(window.location.hash).toBe('#/log');
});
