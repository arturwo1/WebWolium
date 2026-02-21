const PUBLIC_PAGES = new Set(["", "rules", "terms-of-service", "privacy"]);

export function isPublicPage() {
  const pid = document.body?.dataset?.page || "";
  if (PUBLIC_PAGES.has(pid)) return true;

  const p = location.pathname;
  return p.startsWith("/rules/") || p.startsWith("/terms-of-service/") || p.startsWith("/privacy-policy/");
}
