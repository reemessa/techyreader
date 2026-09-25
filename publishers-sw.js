// Offline copy of /publishers, for a book fair with bad signal.
//
// Lives at the site root rather than in publishers/ because a service
// worker can only control pages at or below its own folder, and the page
// is served at /publishers (no trailing slash). Registered from the page
// with scope "/publishers", so it touches nothing else on the site.
//
// The page is answered from the cache straight away and refreshed in the
// background, so a change to the list shows up on the visit after next.
// Bump VERSION to throw away old copies.

const VERSION = 'publishers-v2';
const PAGE = '/publishers';
const FONTS = [
  'aref-ruqaa-400-arabic', 'aref-ruqaa-400-latin', 'aref-ruqaa-400-latin-ext',
  'aref-ruqaa-700-arabic', 'aref-ruqaa-700-latin', 'aref-ruqaa-700-latin-ext',
  'cairo-arabic', 'cairo-latin', 'cairo-latin-ext',
].map((name) => `/fonts/${name}.woff2`);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.add(PAGE);

    // Fonts are a nice-to-have: offline without them, the page falls back
    // to the phone's own font. Never fail the install over them.
    await Promise.all(FONTS.map((url) => cache.add(url).catch(() => {})));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('publishers-') && name !== VERSION)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin === location.origin &&
      ['/publishers', '/publishers/', '/publishers/index.html'].includes(url.pathname)) {
    event.respondWith(page(event));
    return;
  }

  if (url.origin === location.origin && url.pathname.startsWith('/fonts/')) {
    event.respondWith(font(event.request));
  }
  // Anything else goes to the network as normal.
});

async function page(event) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(PAGE);

  const fresh = fetch(PAGE, { cache: 'no-cache' })
    .then((response) => {
      if (response.ok) cache.put(PAGE, response.clone());
      return response;
    });

  if (cached) {
    event.waitUntil(fresh.catch(() => {}));
    return cached;
  }
  return fresh;
}

async function font(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request.url);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request.url, response.clone());
  return response;
}
