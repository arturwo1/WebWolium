const CACHE_NAME = "wolium-v1.236";
const CORE_PAGES = [
  "/",
  "/profile/",
  "/servers/edit/",
  "/leaderboard/",
  "/settings/",
  "/terms-of-service/",
  "/privacy-policy/",
  "/rules/"
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function normalizePath(pathname) {
  if (!pathname) return "/";
  let p = pathname.replace(/\/{2,}/g, "/");
  if (!p.startsWith("/")) p = `/${p}`;
  if (p === "/") return "/";
  return p;
}

function withSlash(pathname) {
  const p = normalizePath(pathname);
  if (p === "/") return "/";
  return p.endsWith("/") ? p : `${p}/`;
}

function withoutSlash(pathname) {
  const p = normalizePath(pathname);
  if (p === "/") return "/";
  return p.endsWith("/") ? p.slice(0, -1) : p;
}

async function cachePutSafe(cache, key, res) {
  try {
    if (!res) return;
    if (res.ok) await cache.put(key, res);
  } catch {}
}

async function cacheAllBestEffort(cache, urls) {
  await Promise.all(
    urls.map(async (u) => {
      try {
        const res = await fetch(u, { cache: "no-store" });
        await cachePutSafe(cache, u, res.clone());
      } catch {}
    })
  );
}

async function precacheFromViteManifest(cache) {
  const candidates = ["/manifest.json", "/.vite/manifest.json"];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;

      const manifest = await res.json();
      const toCache = new Set();

      for (const entry of Object.values(manifest)) {
        if (!entry) continue;

        if (entry.file) toCache.add("/" + String(entry.file).replace(/^\/+/, ""));
        if (Array.isArray(entry.css)) {
          for (const f of entry.css) toCache.add("/" + String(f).replace(/^\/+/, ""));
        }
        if (Array.isArray(entry.assets)) {
          for (const f of entry.assets) toCache.add("/" + String(f).replace(/^\/+/, ""));
        }
      }

      toCache.add(url);

      await cacheAllBestEffort(cache, Array.from(toCache));
      return true;
    } catch {}
  }

  return false;
}

function offlineHtmlResponse() {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Offline</title>
  <style>
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;background:#0b0b0b;color:#ddd}
    .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{max-width:520px;width:100%;background:#111;border:1px solid #222;border-radius:16px;padding:20px}
    h1{margin:0 0 8px;font-size:20px}
    p{margin:0 0 14px;line-height:1.4;color:#bbb}
    button{border:0;border-radius:12px;padding:10px 14px;background:#2b6cff;color:white;font-weight:600;cursor:pointer}
    button:active{transform:translateY(1px)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>You're offline</h1>
      <p>If you opened this page before, it should still work from cache. Try reloading.</p>
      <button onclick="location.reload()">Reload</button>
    </div>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

function offlineSvgResponse() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450">
  <rect width="100%" height="100%" fill="#111"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#bbb" font-size="28">
    Offline
  </text>
</svg>`;
  return new Response(svg, {
    status: 200,
    headers: { "Content-Type": "image/svg+xml; charset=utf-8" }
  });
}

self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    await cacheAllBestEffort(cache, CORE_PAGES);

    await precacheFromViteManifest(cache);

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));

    await self.clients.claim();

    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) c.postMessage({ type: "SW_RELOAD" });
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const p = normalizePath(url.pathname);

      try {
        const fresh = await fetch(req, { cache: "no-store" });

        if (fresh && fresh.ok) {
          const a = withSlash(p);
          const b = withoutSlash(p);

          await cachePutSafe(cache, a, fresh.clone());
          if (a !== b) await cachePutSafe(cache, b, fresh.clone());
        }

        return fresh;
      } catch {
        const a = withSlash(p);
        const b = withoutSlash(p);

        const cached =
          (await cache.match(a)) ||
          (await cache.match(b)) ||
          (await cache.match("/"));

        return cached || offlineHtmlResponse();
      }
    })());
    return;
  }

  if (isSameOrigin(url) && url.pathname.startsWith("/assets/")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        await cachePutSafe(cache, req, fresh.clone());
        return fresh;
      } catch {
        if (req.destination === "image") return offlineSvgResponse();
        return new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);

    const update = (async () => {
      try {
        const fresh = await fetch(req);
        await cachePutSafe(cache, req, fresh.clone());
        return fresh;
      } catch {
        return null;
      }
    })();

    if (cached) {
      event.waitUntil(update);
      return cached;
    }

    const fresh = await update;
    if (fresh) return fresh;

    if (req.destination === "image") return offlineSvgResponse();
    return new Response("Offline", { status: 503 });
  })());
});
