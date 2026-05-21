export function registerServiceWorker({ swUrl = "/sw.js", scope = "/" } = {}) {
  if (!("serviceWorker" in navigator)) return;

  const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const isHttps = location.protocol === "https:";
  if (!isHttps && !isLocalhost) return;

  navigator.serviceWorker.register(swUrl, { scope })
    .then(async (reg) => {
      try {
        await reg.update();
      } catch { }

      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {

        });
      });
    })
    .catch((e) => console.warn("[sw] register failed:", e));

  navigator.serviceWorker.addEventListener("message", (ev) => {
    if (ev?.data?.type === "SW_RELOAD") location.reload();
  });
}
