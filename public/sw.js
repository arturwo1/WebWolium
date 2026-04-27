const CACHE_NAME = "wolium-v1.239";
const fallbackPage = "/offline/";

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function normalizePath(pathname) {
  if (!pathname) return "/";
  let p = pathname.replace(/\/{2,}/g, "/");
  if (!p.startsWith("/")) p = `/${p}`;
  return p === "/" ? "/" : p;
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

async function cachePutSafe(cache, request, response) {
  try {
    if (!response) return;
    if (response.ok || response.type === "opaque") {
      await cache.put(request, response);
    }
  } catch {}
}

async function purgePageVariants(cache, pathname) {
  const p = normalizePath(pathname);
  const a = withSlash(p);
  const b = withoutSlash(p);

  const keys = await cache.keys();
  await Promise.all(
    keys.map((request) => {
      try {
        const u = new URL(request.url);
        if (!isSameOrigin(u)) return;
        const rp = normalizePath(u.pathname);
        if (rp === p || rp === a || rp === b) {
          return cache.delete(request);
        }
      } catch {}
    })
  );
}

function offlineSvgResponse() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450">
  <rect width="100%" height="100%" fill="#0000008c"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#adb0b3" font-size="28">
    Offline
  </text>
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: { "Content-Type": "image/svg+xml; charset=utf-8" }
  });
}

function emptyCssResponse() {
  return new Response("", {
    status: 200,
    headers: { "Content-Type": "text/css; charset=utf-8" }
  });
}

function emptyJsResponse() {
  return new Response("/* offline */", {
    status: 200,
    headers: { "Content-Type": "text/javascript; charset=utf-8" }
  });
}

function emptyTextResponse() {
  return new Response("", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    );
    const cache = await caches.open(CACHE_NAME);
    await cache.add(fallbackPage);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    if (req.mode === "navigate") {
      try {
        const fresh = await fetch(req, { cache: "no-store" });

        if (fresh && fresh.ok) {
          const p = normalizePath(url.pathname);
          const a = withSlash(p);
          const b = withoutSlash(p);

          await purgePageVariants(cache, p);
          await cachePutSafe(cache, a, fresh.clone());
          if (a !== b) await cachePutSafe(cache, b, fresh.clone());
        }

        return fresh;
      } catch {
        const referer = req.headers.get("referer");
        const p = normalizePath(url.pathname);
        const a = withSlash(p);
        const b = withoutSlash(p);

        const cached =
          (await cache.match(req)) ||
          (await cache.match(a)) ||
          (await cache.match(b)) ||
          (await cache.match("/"));

        if (cached) return cached;

        return Response.redirect(`${fallbackPage}?from=${encodeURIComponent(referer || "/")}&to=${encodeURIComponent(url.pathname)}`, 302);
      }
    }

    try {
      const fresh = await fetch(req, { cache: "no-store" });

      if (fresh && (fresh.ok || fresh.type === "opaque")) {
        await cachePutSafe(cache, req, fresh.clone());
      }

      return fresh;
    } catch {
      const cached = await cache.match(req);
      if (cached) return cached;

      if (req.destination === "image") return offlineSvgResponse();
      if (req.destination === "style") return emptyCssResponse();
      if (req.destination === "script") return emptyJsResponse();
      if (req.destination === "font") return emptyTextResponse();
      if (req.destination === "document") return await cache.match("/") || Response.redirect(`${fallbackPage}?from="/"`, 302);

      return new Response("Offline", { status: 503 });
    }
  })());
});