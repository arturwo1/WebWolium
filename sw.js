const CACHE_NAME = 'rbx-calculators-v3';
const ASSETS = [
  '/', '/index.html', '/SPTSC', '/SPTLC', '404.html', '/assets/style.css', '/assets/app.js', 'https://i.ibb.co/r2xfy5Vz/2025-08-16-151027523-1.png', '', 'https://i.ibb.co/fVwGHYd6/2025-08-16-144245432.png', 'https://i.ibb.co/V0JBsHdP/image.png', 'https://i.ibb.co/KS0m9JY/image.png', 'https://i.ibb.co/svG0dydt/image.png', 'https://i.ibb.co/RGVxzxwL/2025-06-20-132934582.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;

  event.respondWith(
    fetch(req)
      .then(networkResp => {

        if (networkResp && networkResp.ok && req.url.startsWith(self.location.origin)) {
          const respClone = networkResp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, respClone));
        }
        return networkResp;
      })
      .catch(() => caches.match(req))
  );
});
