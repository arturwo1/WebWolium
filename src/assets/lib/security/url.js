export function safeLink(url, baseHref = window.location.href) {
  try {
    const u = new URL(url, baseHref);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch { }
  return null;
}
