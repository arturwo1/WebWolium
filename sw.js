const CACHE_NAME = 'rbx-calculators-v3';
const ASSETS = [
  '/', 'index.html', '404.html', '/terms-of-service/', '/privacy-policy/', '/rules/', '/assets/', '/assets/style.css', '/assets/app.js', '/images/Wolium.webp'
];

const EXCLUDE_HOSTS = [
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'adsystem.com',
  'adservice.google.com'
];

function canCacheRequest(request) {
  try {
    const url = new URL(request.url);
    return request.method === 'GET' && url.origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    await Promise.all(ASSETS.map(async (url) => {
      try {
        const req = new Request(url, { mode: 'same-origin' });
        const resp = await fetch(req);
        
        if (resp && (resp.ok || resp.type === 'opaque')) {
          if (canCacheRequest(req)) {
            await cache.put(req, resp.clone());
            console.debug('[SW] Precached', url);
          } else {
            console.debug('[SW] Skipped precache for non-cacheable asset', url);
          }
        } else {
          throw new Error('Response not ok and not opaque: ' + url + ' status:' + (resp && resp.status));
        }
      
      } catch (err) {
        console.warn('[SW] Precache failed', url, err && err.message ? err.message : err);
      }
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    
    await Promise.all(
      keys
        .filter(k => k !== CACHE_NAME)
        .map(k => caches.delete(k))
    );
    
    await self.clients.claim();
    console.debug('[SW] Activated, old caches cleared');
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  let url;
  
  try { url = new URL(req.url); } catch (e) { url = null; }

  if (url && EXCLUDE_HOSTS.some(host => url.hostname.includes(host))) {
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) {
      event.waitUntil((async () => {
        if (!canCacheRequest(req)) return;
        try {
          const networkResp = await fetch(req);
          if (networkResp && (networkResp.ok || networkResp.type === 'opaque')) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(req, networkResp.clone());
            console.debug('[SW] Background cache update', req.url);
          }
        } catch (e) {
          console.warn('[SW] Background update failed for', req.url, e && e.message ? e.message : e);
        }
      })());

      return cached;
    }

    try {
      const networkResp = await fetch(req);
      if (networkResp && (networkResp.ok || networkResp.type === 'opaque') && canCacheRequest(req)) {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(req, networkResp.clone());
          console.debug('[SW] Cached network response', req.url);
        } catch (cErr) {
          console.warn('[SW] Cache put failed for', req.url, cErr && cErr.message ? cErr.message : cErr);
        }
      }

      return networkResp;
    } catch (err) {
      const accept = req.headers.get('accept') || '';

      if (accept.includes('text/html')) {
        return (await caches.match('/index.html')) || (await caches.match('/404.html')) || new Response('<h1>Offline</h1>', {
          status: 503,
          headers: { 'Content-Type': 'text/html' }
        });
      }

      if (req.destination === 'image' || accept.includes('image')) {
        return (await caches.match('/images/error-image.png')) || new Response('', { status: 503 });
      }

      return new Response('Offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  })());
});