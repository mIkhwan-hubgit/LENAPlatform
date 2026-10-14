/* ──────────────────────────────────────────────────────────────────────
   LENA service worker

   Why this exists, in one line: the crisis screen and the user's own
   safety plan have to open when there is no connection, because a safety
   plan you cannot open during a crisis is not a safety plan.

   The whole app is a single HTML document with its images inlined, so
   caching that one document caches every screen except the chatbot, which
   needs the network because it calls the API.

   Caching strategy, by request type:

     POST and other non-GET      network only, never cached
     /api/*                      network only; on failure a JSON error is
                                 returned so the app's existing error path
                                 runs instead of throwing
     navigations                 stale-while-revalidate, so the app opens
                                 instantly from cache, costs no data on a
                                 repeat visit, and quietly updates itself
                                 in the background for next time
     same-origin GET             cache first, then network
     cross-origin GET (fonts)    cache first, then network, failures ignored

   The cache name carries a version. Bump CACHE_VERSION on every deploy
   that changes index.html, otherwise returning users keep being served the
   previous build. This is the one way a service worker commonly goes wrong.
   ────────────────────────────────────────────────────────────────────── */

const CACHE_VERSION = 'v5';
const CACHE = 'lena-' + CACHE_VERSION;

// Everything needed for a cold, offline start.
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll fails the whole install if any single item 404s, which would
    // leave the app with no offline support at all. Add them individually
    // and tolerate the ones that are missing.
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        const resp = await fetch(url, { cache: 'reload' });
        if (resp && resp.status === 200) await cache.put(url, resp.clone());
      } catch (e) { /* this asset simply will not be available offline */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n.startsWith('lena-') && n !== CACHE)
           .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

// Allow the page to force an immediate update if it ever needs to.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

function isCacheable(resp) {
  // 200 only. A 206 partial response must never be cached, and redirects
  // and errors should not be either. Opaque responses (status 0) come from
  // cross-origin font files and are fine to keep.
  if (!resp) return false;
  if (resp.type === 'opaque') return true;
  return resp.status === 200;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Never touch anything that is not a plain GET.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // The chatbot endpoint. Always live, never cached. When offline, hand back
  // a JSON error with the right shape so the app shows its own message
  // rather than an unhandled rejection.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => new Response(
        JSON.stringify({ error: 'offline' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // Page loads. Serve the cached document immediately, refresh behind it.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match('/index.html');

      const network = fetch(req).then((resp) => {
        if (isCacheable(resp)) cache.put('/index.html', resp.clone());
        return resp;
      }).catch(() => null);

      // Cached copy wins on speed. If there is none, wait for the network.
      // If there is no network either, fall back to a plain offline notice.
      return cached || (await network) || new Response(
        '<!doctype html><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>LENA is offline</title>' +
        '<body style="font-family:system-ui;margin:0;display:flex;' +
        'min-height:100vh;align-items:center;justify-content:center;' +
        'background:#F0F9F6;color:#15493E;text-align:center;padding:24px">' +
        '<div><h1 style="font-size:20px;margin:0 0 8px">LENA is offline</h1>' +
        '<p style="margin:0 0 16px;font-size:14px;line-height:1.6">' +
        'Open LENA once while connected and it will work offline after that.' +
        '</p><p style="margin:0;font-size:14px;line-height:1.8">' +
        'If you need someone now<br>' +
        'Befrienders <a href="tel:0376272929">03-7627 2929</a><br>' +
        'Talian Kasih <a href="tel:15999">15999</a><br>' +
        'Emergency <a href="tel:999">999</a></p></div></body>',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    })());
    return;
  }

  // Everything else, including Google Fonts. Cache first.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const resp = await fetch(req);
      if (isCacheable(resp)) cache.put(req, resp.clone());
      return resp;
    } catch (e) {
      // Fonts and other extras failing offline is harmless; the app falls
      // back to system fonts.
      return Response.error();
    }
  })());
});
