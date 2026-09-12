import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const scope = 'https://rharder.github.io/driver-permit-tracking/';
const manifestUrl = scope + 'manifest.webmanifest?v=2';
const cacheName = 'permit-hours-v7';
const markup = version => '<!doctype html><link rel="stylesheet" href="./' + version + '.css"><script src="./' + version + '.js"></script>';
const page = version => new Response(markup(version), { headers: { 'content-type': 'text/html' } });

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function createWorker() {
  const listeners = {};
  const stores = new Map();
  const requests = [];
  const pending = [];
  const timers = new Set();
  let activated = false;
  let skippedWaiting = false;
  const keyFor = request => new URL(typeof request === 'string' ? request : request.url, scope).href;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(key) { return stores.delete(key); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async keys() { return [...entries.keys()].map(url => new Request(url)); },
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
  };
  let network = async request => keyFor(request) === scope ? page('new') : new Response('asset');
  runInNewContext(source, {
    self: {
      registration: { scope },
      location: { origin: new URL(scope).origin },
      clients: { claim() { activated = true; } },
      skipWaiting() { skippedWaiting = true; },
      addEventListener(name, listener) { listeners[name] = listener; },
    },
    caches, URL, Request, Response, Headers, AbortController,
    setTimeout(callback) { timers.add(callback); return callback; },
    clearTimeout(callback) { timers.delete(callback); },
    fetch(request, options) {
      requests.push({ request, options });
      return network(request, options);
    },
  });
  async function lifecycle(name) {
    const work = [];
    listeners[name]({ waitUntil(promise) { work.push(promise); } });
    await Promise.all(work);
  }
  return {
    caches, requests,
    get activated() { return activated; },
    get skippedWaiting() { return skippedWaiting; },
    setNetwork(handler) { network = handler; },
    request(url = manifestUrl, { method = 'GET', mode = 'cors' } = {}) {
      let response;
      listeners.fetch({
        request: { url, method, mode },
        respondWith(promise) { response = promise; },
        waitUntil(promise) { pending.push(promise); },
      });
      return response;
    },
    async finishBackground() { await Promise.all(pending.splice(0)); },
    expireNetwork() { for (const callback of [...timers]) callback(); },
    install() { return lifecycle('install'); },
    activate() { return lifecycle('activate'); },
    async seed(version = 'old', name = cacheName) {
      const cache = await caches.open(name);
      await cache.put(scope, page(version));
      await cache.put(scope + version + '.js', new Response('script'));
      await cache.put(scope + version + '.css', new Response('style'));
      return cache;
    },
  };
}

void test('saved app returns immediately while the network never answers, including query/index URLs', { timeout: 1000 }, async () => {
  const worker = createWorker();
  await worker.seed();
  worker.setNetwork(() => new Promise(() => {}));
  for (const url of [scope, scope + '?from=homescreen', scope + 'index.html']) {
    assert.equal(await (await worker.request(url, { mode: 'navigate' })).text(), markup('old'));
  }
  assert.equal(worker.requests.length, 1, 'concurrent navigations share one background update');
  worker.expireNetwork();
  await worker.finishBackground();
  assert.equal(worker.requests[0].options.signal.aborted, true);
  assert.equal(await (await (await worker.caches.open(cacheName)).match(scope)).text(), markup('old'));
});

void test('new HTML is committed only after every required asset is cached', { timeout: 1000 }, async () => {
  const worker = createWorker();
  const cache = await worker.seed();
  const script = deferred();
  worker.setNetwork(async url => url === scope ? page('new') : url.endsWith('new.js') ? script.promise : new Response('asset'));
  assert.equal(await (await worker.request(scope, { mode: 'navigate' })).text(), markup('old'));
  assert.equal(await (await cache.match(scope)).text(), markup('old'));
  script.resolve(new Response('new script'));
  await worker.finishBackground();
  assert.equal(await (await cache.match(scope)).text(), markup('new'));
  assert.equal(await (await cache.match(scope + 'new.js')).text(), 'new script');
  assert.ok(await cache.match(scope + 'new.css'));
  assert.ok(await cache.match(scope + 'old.js'), 'running old tabs retain their assets');
});

void test('failed assets, HTTP errors and captive-portal pages do not replace the working app', async () => {
  for (const failure of ['asset', 'http', 'portal']) {
    const worker = createWorker();
    const cache = await worker.seed();
    worker.setNetwork(async url => {
      if (url === scope) return failure === 'http' ? new Response('Unavailable', { status: 503 }) : page('new');
      if (url.endsWith('new.js')) return failure === 'portal'
        ? new Response('<html>Log in</html>', { headers: { 'content-type': 'text/html' } })
        : new Response('Unavailable', { status: 404 });
      return new Response('asset');
    });
    await worker.request(scope, { mode: 'navigate' });
    await worker.finishBackground();
    assert.equal(await (await cache.match(scope)).text(), markup('old'));
  }
});

void test('stalled response bodies time out without replacing the cached entrypoint', { timeout: 1000 }, async () => {
  const worker = createWorker();
  const cache = await worker.seed();
  worker.setNetwork(async () => ({
    ok: true, redirected: false, headers: new Headers({ 'content-type': 'text/html' }),
    arrayBuffer() { return new Promise(() => {}); },
  }));
  assert.equal(await (await worker.request(scope, { mode: 'navigate' })).text(), markup('old'));
  worker.expireNetwork();
  await worker.finishBackground();
  assert.equal(await (await cache.match(scope)).text(), markup('old'));
});

void test('manifest is cache-first too and refreshes quietly after a successful request', { timeout: 1000 }, async () => {
  const worker = createWorker();
  const cache = await worker.caches.open(cacheName);
  await cache.put(manifestUrl, new Response('Old metadata'));
  const network = deferred();
  worker.setNetwork(() => network.promise);
  assert.equal(await (await worker.request()).text(), 'Old metadata');
  network.resolve(new Response('Permit Hours'));
  await worker.finishBackground();
  worker.setNetwork(async () => { throw new Error('Offline'); });
  assert.equal(await (await worker.request(scope + 'manifest.webmanifest')).text(), 'Permit Hours');
  await worker.finishBackground();
});

void test('failed manifest updates retain the offline copy; uncached requests fail cleanly', async () => {
  const worker = createWorker();
  await (await worker.caches.open(cacheName)).put(manifestUrl, new Response('Permit Hours'));
  worker.setNetwork(async () => new Response('Unavailable', { status: 503 }));
  assert.equal(await (await worker.request()).text(), 'Permit Hours');
  await worker.finishBackground();
  const emptyWorker = createWorker();
  emptyWorker.setNetwork(async () => { throw new Error('Offline'); });
  assert.equal((await emptyWorker.request()).type, 'error');
  await emptyWorker.finishBackground();
});

void test('migration adopts the previous complete cached app without needing any signal', async () => {
  const worker = createWorker();
  await worker.seed('previous', 'permit-hours-v6');
  worker.setNetwork(() => new Promise(() => {}));
  await worker.install();
  assert.equal(worker.skippedWaiting, true);
  assert.equal(worker.requests.length, 0);
  assert.equal(await (await (await worker.caches.open(cacheName)).match(scope)).text(), markup('previous'));
});

void test('new installation requires a complete core, but PDF downloads cannot block it', async () => {
  const worker = createWorker();
  worker.setNetwork(async url => {
    if (url.endsWith('.mjs')) throw new Error('Optional PDF download unavailable');
    return url === scope ? page('new') : new Response('asset');
  });
  await worker.install();
  assert.equal(worker.skippedWaiting, true);
  assert.equal(worker.requests.some(({ request }) => request.endsWith('.mjs')), false);
  assert.ok(await (await worker.caches.open(cacheName)).match(scope));
  const broken = createWorker();
  broken.setNetwork(async url => url === scope ? page('new') : new Response('Unavailable', { status: 503 }));
  await assert.rejects(broken.install(), /Download failed/);
  assert.equal(broken.skippedWaiting, false);
  assert.equal(await (await broken.caches.open(cacheName)).match(scope), undefined);
});

void test('activation preserves the preceding version for open tabs and leaves other apps alone', async () => {
  const worker = createWorker();
  await worker.seed('current');
  await worker.seed('previous', 'permit-hours-v6');
  await worker.seed('older', 'permit-hours-v5');
  await (await worker.caches.open('other-app-v1')).put('https://rharder.github.io/other/', page('other'));
  await (await worker.caches.open('permit-hours-v99')).put('https://rharder.github.io/another/', page('other'));
  await worker.activate();
  assert.equal(worker.activated, true);
  assert.deepEqual((await worker.caches.keys()).sort(), ['other-app-v1', 'permit-hours-v6', 'permit-hours-v7', 'permit-hours-v99']);
  worker.setNetwork(async () => { throw new Error('Offline'); });
  assert.equal(await (await worker.request(scope + 'previous.js')).text(), 'script');
  await worker.finishBackground();
});

void test('no saved copy plus a stalled connection yields a bounded, helpful retry page', { timeout: 1000 }, async () => {
  const worker = createWorker();
  worker.setNetwork(() => new Promise(() => {}));
  const response = worker.request(scope, { mode: 'navigate' });
  worker.expireNetwork();
  const result = await response;
  assert.equal(result.status, 503);
  assert.match(await result.text(), /Your driving data has not been cleared/);
  await worker.finishBackground();
});

void test('static assets are cache-first, while verification, APIs and external traffic bypass the worker', async () => {
  const worker = createWorker();
  await (await worker.caches.open(cacheName)).put(scope + 'icon.svg', new Response('icon'));
  worker.setNetwork(() => new Promise(() => {}));
  assert.equal(await (await worker.request(scope + 'icon.svg')).text(), 'icon');
  assert.equal(worker.requests.length, 0);
  for (const [url, options] of [
    ['https://accounts.google.com/token', {}],
    ['https://rharder.github.io/another-app/icon.svg', {}],
    [scope + 'api/private', {}],
    [scope + 'googlec75bedecb40315a6.html', { mode: 'navigate' }],
    [manifestUrl, { method: 'POST' }],
  ]) assert.equal(worker.request(url, options), undefined);
  await worker.finishBackground();
});
