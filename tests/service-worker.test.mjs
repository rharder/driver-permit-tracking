import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const scope = 'https://rharder.github.io/driver-permit-tracking/';
const manifestUrl = `${scope}manifest.webmanifest?v=2`;

function createWorker() {
  const listeners = {};
  const stores = new Map();
  const requests = [];
  const keyFor = (request) => new URL(typeof request === 'string' ? request : request.url, scope).href;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(key) { return stores.delete(key); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async put(request, response) { entries.set(keyFor(request), response.clone()); },
        async match(request, options = {}) {
          const key = keyFor(request);
          const entry = [...entries].find(([url]) => options.ignoreSearch
            ? url.split('?')[0] === key.split('?')[0]
            : url === key);
          return entry?.[1].clone();
        },
      };
    },
    async match(request) {
      for (const name of stores.keys()) {
        const response = await (await caches.open(name)).match(request);
        if (response) return response;
      }
    },
  };
  let network = async () => new Response('Permit Hours');
  runInNewContext(source, {
    self: {
      registration: { scope },
      location: { origin: new URL(scope).origin },
      clients: { claim() {} },
      skipWaiting() {},
      addEventListener(name, listener) { listeners[name] = listener; },
    },
    caches, URL, Response,
    fetch(request, options) {
      requests.push({ request, options });
      return network(request, options);
    },
  });
  return {
    caches, requests,
    setNetwork(handler) { network = handler; },
    /** @returns {Promise<Response> | undefined} */
    request(url = manifestUrl, method = 'GET') {
      /** @type {Promise<Response> | undefined} */
      let response;
      listeners.fetch({
        request: new Request(url, { method }),
        respondWith(promise) { response = promise; },
      });
      return response;
    },
    async activate() {
      let completion = Promise.resolve();
      listeners.activate({ waitUntil(promise) { completion = promise; } });
      await completion;
    },
  };
}

test('manifest refreshes a cached installation name and saves it for offline use', async () => {
  const worker = createWorker();
  const cache = await worker.caches.open('permit-hours-v5');
  await cache.put(manifestUrl, new Response('Permit Miles'));
  assert.equal(await (await worker.request()).text(), 'Permit Hours');
  assert.equal(worker.requests[0].options.cache, 'no-cache');
  worker.setNetwork(async () => { throw new Error('Offline'); });
  assert.equal(await (await worker.request()).text(), 'Permit Hours');
});

test('offline manifest requests can use the precached version despite query changes', async () => {
  const worker = createWorker();
  await (await worker.caches.open('permit-hours-v5')).put(manifestUrl, new Response('Permit Hours'));
  worker.setNetwork(async () => { throw new Error('Offline'); });
  assert.equal(await (await worker.request(`${scope}manifest.webmanifest`)).text(), 'Permit Hours');
});

test('failed HTTP responses do not replace the offline manifest', async () => {
  const worker = createWorker();
  await (await worker.caches.open('permit-hours-v5')).put(manifestUrl, new Response('Permit Hours'));
  worker.setNetwork(async () => new Response('Unavailable', { status: 503 }));
  assert.equal(await (await worker.request()).text(), 'Permit Hours');
});

test('a missing network and cache returns a network error', async () => {
  const worker = createWorker();
  worker.setNetwork(async () => { throw new Error('Offline'); });
  assert.equal((await worker.request()).type, 'error');
});

test('activation replaces app caches without deleting other GitHub Pages apps', async () => {
  const worker = createWorker();
  for (const name of ['permit-miles-v1', 'permit-hours-v4', 'permit-hours-v5', 'other-app-v1']) {
    await worker.caches.open(name);
  }
  await worker.activate();
  assert.deepEqual(await worker.caches.keys(), ['permit-hours-v5', 'other-app-v1']);
});

test('cached app assets still work offline; external and non-GET requests are untouched', async () => {
  const worker = createWorker();
  const asset = `${scope}icon.svg`;
  await (await worker.caches.open('permit-hours-v5')).put(asset, new Response('icon'));
  worker.setNetwork(async () => { throw new Error('Offline'); });
  assert.equal(await (await worker.request(asset)).text(), 'icon');
  assert.equal(worker.requests.length, 0);
  assert.equal(worker.request('https://accounts.google.com/manifest.webmanifest'), undefined);
  assert.equal(worker.request(manifestUrl, 'POST'), undefined);
});
