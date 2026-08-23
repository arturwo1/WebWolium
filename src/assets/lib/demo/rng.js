export function createRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function detectDemoDeviceKey() {
  if (typeof navigator === "undefined" || !navigator.userAgent) return "desktop";
  if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) return "mobile";
  return "web";
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}