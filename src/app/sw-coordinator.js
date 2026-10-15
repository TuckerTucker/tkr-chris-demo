/* Classic worker import emitted by Vite with immutable build/schema identity. */
const golfBuild = '__GOLF_BUILD_ID__';
const golfSchema = Number('__GOLF_SCHEMA_VERSION__');
const golfCachePrefix = 'golf-scorecard-';
const golfRequests = new Map();
let golfUpdating = false;
let golfPruning = false;

/** Enumerate every same-scope window, including clients not yet controlled. */
async function golfClients() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return clients.filter((client) => client.url.startsWith(self.registration.scope));
}

/** Resolve only when every enumerated client has replied to this unique nonce. */
async function golfAsk(type, clients) {
  const nonce = crypto.randomUUID();
  const replies = new Map();
  const complete = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000);
    golfRequests.set(nonce, {
      expected: new Set(clients.map((client) => client.id)), replies,
      complete() { clearTimeout(timer); resolve(replies); },
    });
    if (!clients.length) { clearTimeout(timer); resolve(replies); }
  });
  for (const client of clients) client.postMessage({ type, nonce, schema: golfSchema });
  const result = await complete;
  golfRequests.delete(nonce);
  return { nonce, replies: result };
}

/** Notify every locked client on abort; no tab is reloaded by the worker. */
function golfAbort(clients, nonce, reason) {
  for (const client of clients) client.postMessage({ type: 'GOLF_UPDATE_ABORT', nonce, reason });
}

/** Freeze and verify every client before permitting the waiting worker to activate. */
async function golfApply(requestor) {
  if (golfUpdating) return;
  golfUpdating = true;
  let clients = [];
  let nonce;
  try {
    clients = await golfClients();
    const answer = await golfAsk('GOLF_UPDATE_PREPARE', clients);
    nonce = answer.nonce;
    const replies = answer.replies;
    const current = await golfClients();
    const unchanged = current.length === clients.length && current.every((client) => clients.some((item) => item.id === client.id));
    if (!replies || !unchanged || [...replies.values()].some((reply) => reply.safe !== true || reply.schema !== golfSchema)) {
      golfAbort(clients, nonce, 'Finish saved work in every open Scorecard tab, then try the update again.');
      return;
    }
    await self.skipWaiting();
  } catch {
    golfAbort(clients, nonce, 'The update could not be applied. Your saved rounds are unchanged; try again.');
    requestor?.postMessage({ type: 'GOLF_UPDATE_ERROR' });
  } finally {
    golfUpdating = false;
  }
}

/** Retain only caches whose build can still be needed; unknown clients defer cleanup. */
async function golfPrune() {
  if (golfPruning || self.registration.waiting || self.registration.installing) return;
  golfPruning = true;
  try {
    const clients = await golfClients();
    const { replies } = await golfAsk('GOLF_BUILD_QUERY', clients);
    if (!replies || [...replies.values()].some((reply) => typeof reply.build !== 'string' || !reply.build)) return;
    const current = await golfClients();
    if (current.length !== clients.length || current.some((client) => !replies.has(client.id))) return;
    if (self.registration.waiting || self.registration.installing) return;
    const keep = new Set([golfBuild, ...[...replies.values()].map((reply) => reply.build)]);
    for (const name of await caches.keys()) {
      if (name.startsWith(golfCachePrefix) && ![...keep].some((build) => name.startsWith(`${golfCachePrefix}${build}-`))) {
        await caches.delete(name);
      }
    }
  } finally { golfPruning = false; }
}

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;
  if (message.type === 'GOLF_CLIENT_REPLY' && typeof message.nonce === 'string') {
    const pending = golfRequests.get(message.nonce);
    const id = event.source?.id;
    if (pending && pending.expected.has(id)) {
      pending.replies.set(id, message);
      if (pending.replies.size === pending.expected.size) pending.complete();
    }
  } else if (message.type === 'GOLF_APPLY_UPDATE') {
    event.waitUntil(golfApply(event.source));
  } else if (message.type === 'GOLF_PRUNE_CACHES') {
    event.waitUntil(golfPrune().catch(() => {
      event.source?.postMessage({ type: 'GOLF_CACHE_ERROR' });
    }));
  }
});
