const SNOWFLAKE_RE = /^\d{15,25}$/;
const CDN_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

const FIELDS = {
  user: "users",
  channel: "channels",
  guild: "guilds",
  role: "roles"
};

export const ENTITY_TYPES = Object.keys(FIELDS);

export function isSnowflake(value) {
  return SNOWFLAKE_RE.test(String(value ?? ""));
}

export function defaultAvatarUrl(userId) {
  if (!isSnowflake(userId)) return null;
  const index = Number((BigInt(String(userId)) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export function safeAvatarUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" || !CDN_HOSTS.has(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function normalizeColor(value) {
  if (typeof value === "number" && value > 0 && value <= 0xffffff) return `#${value.toString(16).padStart(6, "0")}`;
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value ?? ""));
  return match ? `#${match[1].toLowerCase()}` : null;
}

export function normalizeEntity(type, raw) {
  if (!raw || typeof raw !== "object") return null;

  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 100) : "";

  if (type === "user") {
    const avatar = safeAvatarUrl(raw.avatar);
    return name || avatar ? { name, avatar } : null;
  }

  if (!name) return null;
  if (type === "channel") return { name, guildId: isSnowflake(raw.guild_id) ? String(raw.guild_id) : null };
  if (type === "guild") return { name, icon: safeAvatarUrl(raw.icon) };
  if (type === "role") return { name, color: normalizeColor(raw.color) };
  return null;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function createEntityResolver({
  fetchers = {},
  storage = null,
  storageKey = "wolium:entities:v1",
  ttlMs = 21_600_000,
  missTtlMs = 600_000,
  errorTtlMs = 30_000,
  batchMs = 40,
  maxBatch = 50,
  maxStored = 300,
  persistMs = 400,
  now = () => Date.now()
}) {
  const cache = new Map();
  const seeds = new Map();
  const pending = new Map();
  const inflight = new Map();
  const listeners = new Set();

  let flushTimer = null;
  let persistTimer = null;

  const keyOf = (type, id) => `${type}:${id}`;

  function load() {
    if (!storage) return;
    const saved = storage.get(storageKey, null);
    const items = saved && typeof saved === "object" ? saved.items : null;
    if (!items || typeof items !== "object") return;
    const t = now();
    for (const [key, item] of Object.entries(items)) {
      if (item && item.e > t && item.d) cache.set(key, { data: item.d, exp: item.e });
    }
  }

  function persist() {
    persistTimer = null;
    if (!storage) return;
    const live = [...cache.entries()].filter(([, entry]) => entry.data && entry.exp > now());
    live.sort((a, b) => b[1].exp - a[1].exp);
    const items = {};
    for (const [key, entry] of live.slice(0, maxStored)) items[key] = { d: entry.data, e: entry.exp };
    storage.set(storageKey, { v: 1, items });
  }

  function schedulePersist() {
    if (!storage) return;
    if (persistMs <= 0) {
      persist();
      return;
    }
    if (!persistTimer) persistTimer = setTimeout(persist, persistMs);
  }

  function notify() {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch { }
    }
  }

  function fresh(key) {
    const entry = cache.get(key);
    return entry && entry.exp > now() ? entry : null;
  }

  async function run(entries, guildId) {
    const byType = new Map();
    for (const entry of entries) {
      if (!byType.has(entry.type)) byType.set(entry.type, []);
      byType.get(entry.type).push(entry);
    }

    for (const [type, list] of byType) {
      let result = null;
      let failed = false;

      try {
        result = await fetchers[type](list.map((entry) => entry.id), { guildId });
      } catch {
        failed = true;
      }

      const stamp = now();

      for (const entry of list) {
        const key = keyOf(entry.type, entry.id);
        const data = failed ? null : normalizeEntity(entry.type, result?.[entry.id]);
        const ttl = failed ? errorTtlMs : data ? ttlMs : missTtlMs;
        cache.set(key, { data, exp: stamp + ttl });
        inflight.delete(key);
        entry.resolve(data);
      }
    }

    schedulePersist();
    notify();
  }

  async function flush() {
    flushTimer = null;
    const batch = [...pending.values()];
    pending.clear();

    const groups = new Map();
    for (const entry of batch) {
      const group = entry.guildId ?? "";
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(entry);
    }

    const jobs = [];
    for (const [group, entries] of groups) {
      for (const part of chunk(entries, maxBatch)) jobs.push(run(part, group || null));
    }

    await Promise.all(jobs);
  }

  load();

  return {
    peek(type, id) {
      const key = keyOf(type, id);
      const entry = fresh(key);
      if (entry?.data) return entry.data;
      return seeds.get(key) ?? null;
    },

    seed(type, id, data) {
      const normalized = normalizeEntity(type, data);
      if (normalized && ENTITY_TYPES.includes(type)) seeds.set(keyOf(type, id), normalized);
    },

    request(type, id, { guildId = null } = {}) {
      if (!ENTITY_TYPES.includes(type) || !isSnowflake(id) || typeof fetchers[type] !== "function") return Promise.resolve(null);

      const key = keyOf(type, id);
      const entry = fresh(key);
      if (entry) return Promise.resolve(entry.data);
      if (inflight.has(key)) return inflight.get(key);

      let resolve;
      const promise = new Promise((done) => {
        resolve = done;
      });

      inflight.set(key, promise);
      pending.set(key, { type, id: String(id), guildId: isSnowflake(guildId) ? String(guildId) : null, resolve });
      if (!flushTimer) flushTimer = setTimeout(flush, batchMs);

      return promise;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    clear() {
      cache.clear();
      seeds.clear();
      schedulePersist();
    }
  };
}
