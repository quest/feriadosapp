// Service worker: makes Feriados Chile work offline.
// - App shell: precached on install, then stale-while-revalidate.
// - Pages (navigations): network first, falling back to the cached copy or to the app.
// - api.boostr.cl/holidays: network first, falling back to the last good answer.
// - /api/ (the old static JSON of this site) and third parties (Google Analytics) are not touched.
//
// Bump VERSION on every deploy that changes the shell so phones pick up the new files.

const VERSION = '2026-11-13.4';
const SHELL_CACHE = `shell-${VERSION}`;
const PAGES_CACHE = 'pages-v1';
const API_CACHE = 'api-v1';
const NETWORK_TIMEOUT_MS = 4000;

const SHELL = [
  '/',
  '/css/app.css',
  '/fonts/inter-latin.woff2',
  '/js/app.js',
  '/js/analytics.js',
  '/js/config.js',
  '/js/page.js',
  '/js/shell.js',
  '/js/years.js',
  '/js/lib/api.js',
  '/js/lib/dates.js',
  '/js/lib/holidays.js',
  '/js/lib/ics.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, PAGES_CACHE, API_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function fetchWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS);
    fetch(request).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

async function networkFirst(event, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetchWithTimeout(event.request);
    if (res.ok) event.waitUntil(cache.put(event.request, res.clone()));
    return res;
  } catch (err) {
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(event.request, { ignoreSearch: true });
  const network = fetch(event.request)
    .then((res) => {
      if (res.ok) return cache.put(event.request, res.clone()).then(() => res);
      return res;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return;
    if (request.mode === 'navigate') {
      event.respondWith(networkFirst(event, PAGES_CACHE, '/'));
      return;
    }
    event.respondWith(staleWhileRevalidate(event));
    return;
  }

  if (url.hostname === 'api.boostr.cl' && url.pathname.startsWith('/holidays')) {
    event.respondWith(networkFirst(event, API_CACHE));
  }
});
