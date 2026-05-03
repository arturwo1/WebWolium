export function lsCleanExpired(prefix, maxAgeMs) {
  try {
    const now = Date.now();
    const keysToDelete = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw);
        if (!parsed.t || now - parsed.t > maxAgeMs) {
          localStorage.removeItem(key);
          console.debug(`[lsClean] Deleted old cache: ${key}`);
        }
      } catch {
        localStorage.removeItem(key);
      }
    });
    
    return true;
  } catch (e) {
    console.error("[lsClean] Error while cleaning:", e);
    return false;
  }
}

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
