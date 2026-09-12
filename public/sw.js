const CACHE_NAME = 'permit-hours-v7';
const ROOT_URL = new URL('./', self.registration.scope).href;
const MANIFEST_URL = new URL('./manifest.webmanifest', ROOT_URL).href;
const OPTIONAL_ASSETS = ['./pdf.min.mjs', './pdf.worker.min.mjs'];
const NETWORK_TIMEOUT_MS = 12000;
let shellUpdate;

function inApp(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(new URL(ROOT_URL).pathname);
}

function shellAssets(markup) {
  return [...new Set([...markup.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map(match => new URL(match[1].replaceAll('&amp;', '&'), ROOT_URL))
    .filter(url => inApp(url) && /\.(?:js|mjs|css|svg|png|ico|webmanifest|woff2?)(?:$|\?)/.test(url.pathname + url.search))
    .map(url => url.href))];
}

// Bound the whole operation, including stalled response bodies (not just headers).
async function withNetworkDeadline(operation) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Connection timed out'));
    }, NETWORK_TIMEOUT_MS);
  });
  try { return await Promise.race([operation(controller.signal), timeout]); }
  finally { clearTimeout(timer); controller.abort(); }
}

async function download(url, signal, html = false) {
  const response = await fetch(url, { cache: 'no-cache', signal });
  if (!response.ok || response.redirected) throw new Error('Download failed');
  const type = response.headers.get('content-type') ?? '';
  if (html && !type.includes('text/html')) throw new Error('Expected an app page');
  if (!html && /\.(?:js|mjs|css)(?:$|\?)/.test(String(url)) && type.includes('text/html')) throw new Error('Expected an app asset');
  const bytes = await response.arrayBuffer();
  if (signal.aborted) throw new Error('Connection timed out');
  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  return new Response(bytes, { status: response.status, statusText: response.statusText, headers });
}

async function appCacheNames() {
  return (await caches.keys()).filter(name => /^(permit-hours|permit-miles)-v\d+$/.test(name))
    .sort((a, b) => Number(b.match(/\d+$/)[0]) - Number(a.match(/\d+$/)[0]));
}

async function cachedAsset(request) {
  const current = await (await caches.open(CACHE_NAME)).match(request);
  if (current) return current;
  // Existing tabs may still request files from the preceding working version.
  for (const name of await appCacheNames()) {
    if (name === CACHE_NAME) continue;
    const cache = await caches.open(name);
    if (await cache.match(ROOT_URL)) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
  }
}

function refreshShell() {
  if (shellUpdate) return shellUpdate;
  shellUpdate = withNetworkDeadline(async signal => {
    const cache = await caches.open(CACHE_NAME);
    const page = await download(ROOT_URL, signal, true);
    const assets = shellAssets(await page.clone().text());
    if (!assets.some(url => /\.js(?:$|\?)/.test(url))) throw new Error('Incomplete app page');
    await Promise.all(assets.map(async url => {
      if (await cache.match(url)) return;
      const response = await download(url, signal);
      if (!signal.aborted) await cache.put(url, response);
    }));
    if (signal.aborted) throw new Error('Connection timed out');
    // Commit the entrypoint LAST: failures must never strand HTML without its assets.
    await cache.put(ROOT_URL, page);
  }).finally(() => { shellUpdate = undefined; });
  return shellUpdate;
}

async function warmOptionalAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(OPTIONAL_ASSETS.map(async path => {
    const url = new URL(path, ROOT_URL).href;
    if (await cache.match(url)) return;
    try {
      await withNetworkDeadline(async signal => {
        const response = await download(url, signal);
        if (!signal.aborted) await cache.put(url, response);
      });
    } catch { /* PDF importing is optional; retry on a later launch. */ }
  }));
}

async function seedFromPreviousVersion() {
  const cache = await caches.open(CACHE_NAME);
  for (const name of await appCacheNames()) {
    if (name === CACHE_NAME) continue;
    const previous = await caches.open(name);
    const page = await previous.match(ROOT_URL);
    if (!page) continue;
    const assets = shellAssets(await page.clone().text());
    if (!assets.some(url => /\.js(?:$|\?)/.test(url))) continue;
    const responses = await Promise.all(assets.map(url => previous.match(url)));
    if (responses.some(response => !response)) continue;
    // Copy only assets belonging to this app. No network is needed for migration.
    for (const request of await previous.keys()) {
      const url = new URL(request.url);
      if (inApp(url) && url.href !== ROOT_URL) await cache.put(request, await previous.match(request));
    }
    await cache.put(ROOT_URL, page);
    return true;
  }
  return false;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    if (!await seedFromPreviousVersion()) await refreshShell();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Retain the newest previous app cache for already-open tabs; never touch other apps.
    let retainedPrevious = false;
    for (const name of await appCacheNames()) {
      if (name === CACHE_NAME) continue;
      if (!await (await caches.open(name)).match(ROOT_URL)) continue;
      if (!retainedPrevious) retainedPrevious = true;
      else await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

function unavailablePage() {
  return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Permit Hours — connection needed</title><body style="font:18px system-ui;padding:24px;max-width:36rem;margin:auto"><h1>Let’s get your saved app ready.</h1><p>This browser does not have a complete offline copy yet. Open Permit Hours once with a working connection, then it can start from this device.</p><p>Your driving data has not been cleared.</p><button style="font:inherit;padding:12px" onclick="location.reload()">Try again</button></body></html>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !inApp(url)) return;

  const appNavigation = event.request.mode === 'navigate' && [new URL(ROOT_URL).pathname, new URL('index.html', ROOT_URL).pathname].includes(url.pathname);
  if (appNavigation) {
    // Serve the cached app immediately, even while fetch remains pending indefinitely.
    const cached = caches.open(CACHE_NAME).then(cache => cache.match(ROOT_URL));
    const update = refreshShell();
    event.waitUntil(update.then(warmOptionalAssets).catch(() => undefined));
    event.respondWith(cached.then(async page => {
      if (page) return page;
      try { await update; return (await (await caches.open(CACHE_NAME)).match(ROOT_URL)) || unavailablePage(); }
      catch { return unavailablePage(); }
    }));
    return;
  }
  // Verification files, unrelated pages, and private/third-party requests are not app-shell fallbacks.
  if (event.request.mode === 'navigate') return;

  if (url.pathname === new URL(MANIFEST_URL).pathname) {
    const cache = caches.open(CACHE_NAME);
    const update = withNetworkDeadline(async signal => {
      const response = await download(event.request.url, signal);
      if (!signal.aborted) await (await cache).put(MANIFEST_URL, response.clone());
      return response;
    });
    event.waitUntil(update.catch(() => undefined));
    event.respondWith(cache.then(async store => (await store.match(MANIFEST_URL)) || (await store.match(MANIFEST_URL, { ignoreSearch: true })) || update.catch(() => Response.error())));
    return;
  }

  // Only static app assets are cached. This must never become a cache for authentication or APIs.
  if (!/\.(?:js|mjs|css|svg|png|ico|webmanifest|woff2?)(?:$|\?)/.test(url.pathname + url.search)) return;
  const result = (async () => {
    const cached = await cachedAsset(event.request);
    if (cached) return cached;
    try {
      return await withNetworkDeadline(async signal => {
        const response = await download(event.request.url, signal);
        if (!signal.aborted) await (await caches.open(CACHE_NAME)).put(event.request, response.clone());
        return response;
      });
    } catch { return Response.error(); }
  })();
  event.respondWith(result);
  event.waitUntil(result.then(() => undefined));
});
