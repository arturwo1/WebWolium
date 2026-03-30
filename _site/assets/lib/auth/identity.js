import { lsGet, lsSet } from "../storage.js";

export const IDENTITY_KEY = "wolium:last_identity";

export function saveIdentity(session) {
  try {
    const u = session?.user;
    if (!u) return;
    const m = u.user_metadata || {};
    lsSet(IDENTITY_KEY, JSON.stringify({
      userId: u.id,
      name: m.full_name || m.name || m.username || u.email || "",
      avatar: m.avatar_url || m.picture || null,
      ts: Date.now()
    }));
  } catch {}
}

export function readIdentity() {
  try {
    const raw = lsGet(IDENTITY_KEY, null);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
