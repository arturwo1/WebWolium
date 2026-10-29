export function stableStringify(obj) {
  if (!obj || typeof obj !== "object") return String(obj ?? "");
  const keys = Object.keys(obj).sort();
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return JSON.stringify(out);
}

export function safeJsonParse(raw, fallback = null) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
