export function lsGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function lsDel(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function lsJSONGet(key, fallback = null) {
  const raw = lsGet(key, null);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function lsJSONSet(key, obj) {
  try {
    return lsSet(key, JSON.stringify(obj));
  } catch {
    return false;
  }
}
