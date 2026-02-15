const CACHE_NAME = "wolium-v1.01";

const CORE_ASSETS = [
  "/",
  "/profile/",
  "/servers/edit/",
  "/leaderboard/",
  "/settings/",
  "/terms-of-service/",
  "/privacy-policy/",
  "/rules/",
  "/assets/style.css",
  "/images/Wolium.webp",
  "/images/error-image.png",
];

async function cacheAllBestEffort(cache, urls) {
  await Promise.all(urls.map(async (u) => {
    try {
      const res = await fetch(u, { cache: "no-store" });
      if (res && res.ok) await cache.put(u, res);
    } catch { }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cacheAllBestEffort(cache, CORE_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/assets/") && (url.pathname.endsWith(".js") || url.pathname.endsWith(".mjs") || url.pathname.endsWith(".css"))) {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok && !fresh.redirected) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone()).catch(() => { });
        }
        return fresh;
      } catch {
        return (await caches.match(req)) || (await caches.match("/")) || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      if (fresh.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone()).catch(() => { });
      }
      return fresh;
    } catch {
      if (req.destination === "image") {
        return (await caches.match("/images/error-image.png")) || new Response("", { status: 503 });
      }
      return new Response("Offline", { status: 503 });
    }
  })());
});