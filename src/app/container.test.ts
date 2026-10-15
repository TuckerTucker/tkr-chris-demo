import { afterEach, expect, test } from 'vitest';
import { deleteDB } from 'idb';
import { buildContainer, localDate } from './container';
import type { Container } from './container';
import { createLogger } from './logger';
import { hole, play } from '../storage/__tests__/support';

const opened: Container[] = [];
const names = new Set<string>();
async function open(name = `container-${crypto.randomUUID()}`): Promise<Container> {
  names.add(name);
  const c = await buildContainer({ dbName: name, logger: createLogger({ level: 'fatal' }), today: () => '2026-10-15' });
  opened.push(c); return c;
}
afterEach(async () => {
  for (const c of opened.splice(0)) c.close();
  for (const name of names) await deleteDB(name);
  names.clear();
});

test('local calendar date uses the device date rather than UTC serialization', () => {
  expect(localDate(new Date(2026, 0, 2, 0, 5))).toBe('2026-01-02');
});

test('composes shared ports, isolated editors, remembered par and persistent removal recovery', async () => {
  const name = `container-${crypto.randomUUID()}`;
  const c = await open(name);
  await c.session.start();
  await c.session.save(hole(1, 5));
  const active = c.session.getSnapshot().round;
  expect(active?.date).toBe('2026-10-15');
  expect(await c.parSource.suggestPar(1)).toBe(5);
  const editor = c.createSession();
  expect(editor).not.toBe(c.session);
  await editor.load(active?.id);
  expect(editor.getSnapshot().round?.id).toBe(active?.id);
  editor.dispose();
  if (!active) throw new Error('Missing active round');
  await c.undo.remove(active.id, active.revision);
  c.close();
  const reopened = await open(name);
  expect(reopened.session.getSnapshot().round).toBeNull();
  expect(reopened.undo.getSnapshot().item?.round).toEqual(active);
  expect(await reopened.canActivateUpdate()).toBe(false);
  await reopened.undo.undo();
  expect((await reopened.repository.getInProgress())?.holes).toEqual(active.holes);
});

test('update readiness reads active rounds, finished drafts and persistent undo globally', async () => {
  const c = await open();
  expect(await c.canActivateUpdate()).toBe(true);
  let round = await play(c.repository, 9);
  expect(await c.canActivateUpdate()).toBe(false);
  round = await c.repository.finishRound(round.id, round.revision);
  expect(await c.canActivateUpdate()).toBe(true);
  round = await c.repository.saveDraft(round.id, { ...hole(1), strokes: 6 }, round.revision);
  expect(await c.canActivateUpdate()).toBe(false);
  round = await c.repository.discardDraft(round.id, 1, round.revision);
  await c.undo.remove(round.id, round.revision);
  expect(await c.canActivateUpdate()).toBe(false);
  await c.undo.dismiss();
  expect(await c.canActivateUpdate()).toBe(true);
});

test('mutation lock rejects new writes but leaves existing data intact', async () => {
  const c = await open();
  c.setUpdateLocked(true);
  await expect(c.session.start()).rejects.toMatchObject({ kind: 'blocked' });
  expect(await c.repository.getInProgress()).toBeUndefined();
  c.setUpdateLocked(false);
  await c.session.start();
  expect(c.session.getSnapshot().round).not.toBeNull();
});

test('commit subscription and real cross-tab channel refresh active state', async () => {
  const name = `container-${crypto.randomUUID()}`;
  const first = await open(name);
  const second = await open(name);
  let notifications = 0;
  first.subscribe(() => { throw new Error('Subscriber failure'); });
  const unsubscribe = first.subscribe(() => { notifications += 1; });
  await first.session.start();
  expect(notifications).toBeGreaterThan(0);
  await expect.poll(() => second.session.getSnapshot().round?.id).toBe(first.session.getSnapshot().round?.id);
  unsubscribe();
});
