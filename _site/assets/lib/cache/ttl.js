import { nowMs } from "../time.js";
import { lsJSONGet, lsJSONSet } from "../storage.js";

const MEM = new Map();

export function ttlGet(key) {
  const m = MEM.get(key);
  if (m && m.exp > nowMs()) return m.val;

  const obj = lsJSONGet(key, null);
  if (obj && obj.exp > nowMs()) {
    MEM.set(key, obj);
    return obj.val;
  }

  return null;
}

export function ttlSet(key, val, ttlMs) {
  const obj = { exp: nowMs() + ttlMs, val };
  MEM.set(key, obj);
  lsJSONSet(key, obj);
}

export function ttlDrop(key) {
  MEM.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {}
}
