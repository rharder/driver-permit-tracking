const CACHE_NAME = 'permit-hours-v2';
const APP_SHELL = ['./', './manifest.webmanifest', './favicon.svg', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL.slice(1));

    const rootUrl = new URL('./', self.registration.scope);
    const response = await fetch(rootUrl);
    const markup = await response.clone().text();
    await cache.put(rootUrl, response);

    const assets = [...markup.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => new URL(match[1], rootUrl).href)
      .filter((url) => new URL(url).origin === self.location.origin);
    await cache.addAll([...new Set(assets)]);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => (await caches.match(event.request)) || (await caches.match('./'))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })),
  );
});
