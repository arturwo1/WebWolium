export function env(name, fallback = undefined) {
  const value = process.env[name];

  if (value == null || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing env: ${name}`);
  }

  return value;
}

export function intEnv(name, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name];
  const value = raw == null || raw === "" ? fallback : Number(raw);

  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
