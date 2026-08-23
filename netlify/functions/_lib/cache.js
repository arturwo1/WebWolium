import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { intEnv } from "./env.js";

let store = null;

function blobStore() {
  if (store) return store;
  store = getStore({ name: "api-cache", consistency: "eventual" });
  return store;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  const body = keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",");
  return `{${body}}`;
}

function hash(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 32);
}

export function cacheKey(identity, kind, payload) {
  return `${identity}/${kind}/${hash(payload)}`;
}

export function statusKey(id) {
  return `req/${id}`;
}

const LIVE_WINDOW_MS = 5 * 60 * 1000;

const TTL_SECONDS = {
  public_stats: 60,
  user_privacy: 30,
  get_guild_config: 30,
  user_activities_series_live: 20,
  user_activities_series_historic: intEnv("CACHE_HISTORIC_TTL_S", 21_600, 60, 604_800),
  guild_activities_series_live: 20,
  guild_activities_series_historic: intEnv("CACHE_HISTORIC_TTL_S", 21_600, 60, 604_800),
  guild_members_series_live: 20,
  guild_members_series_historic: intEnv("CACHE_HISTORIC_TTL_S", 21_600, 60, 604_800),
  leaderboard: 30,
  user_profile_stats: 30,
  guild_profile_stats: 30,
  user_messages_series_live: 20,
  user_messages_series_historic: intEnv("CACHE_HISTORIC_TTL_S", 21_600, 60, 604_800),
  user_voice_series_live: 20,
  user_voice_series_historic: intEnv("CACHE_HISTORIC_TTL_S", 21_600, 60, 604_800),
  user_commands_series_live: 20,
  user_commands_series_historic: intEnv("CACHE_HISTORIC_TTL_S", 21_600, 60, 604_800),
  guild_messages_series_live: 20,
  guild_messages_series_historic: intEnv("CACHE_HISTORIC_TTL_S", 21_600, 60, 604_800),
  guild_voice_series_live: 20,
  guild_voice_series_historic: intEnv("CACHE_HISTORIC_TTL_S", 21_600, 60, 604_800),
  user_guilds: 30
};

export const UNCACHEABLE_KINDS = new Set([
  "set_privacy",
  "delete_user_data",
  "delete_all_user_data",
  "save_guild_config"
]);

export function ttlSecondsFor(kind, payload) {
  const toMs = Number(payload?.to);
  const isSeries = kind.endsWith("_series");

  if (isSeries && Number.isFinite(toMs)) {
    const bucket = Date.now() - toMs <= LIVE_WINDOW_MS ? "live" : "historic";
    return TTL_SECONDS[`${kind}_${bucket}`] ?? TTL_SECONDS[kind] ?? 20;
  }

  return TTL_SECONDS[kind] ?? 20;
}

export async function cacheGet(key) {
  try {
    const raw = await blobStore().get(key, { type: "json" });
    if (!raw || typeof raw !== "object") return null;
    if (raw.expiresAt && raw.expiresAt < Date.now()) return null;
    return raw.value;
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds) {
  try {
    await blobStore().setJSON(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  } catch {

  }
}

export async function cacheDeletePrefix(prefix) {
  try {
    const s = blobStore();
    const { blobs } = await s.list({ prefix });
    await Promise.all(blobs.map(b => s.delete(b.key)));
  } catch {

  }
}

export async function withCache(identity, kind, payload, computeFn) {
  if (UNCACHEABLE_KINDS.has(kind)) {
    const value = await computeFn();
    await cacheDeletePrefix(`${identity}/`);
    return { value, hit: false };
  }

  const key = cacheKey(identity, kind, payload);
  const cached = await cacheGet(key);

  if (cached !== null) {
    return { value: cached, hit: true };
  }

  const value = await computeFn();
  await cacheSet(key, value, ttlSecondsFor(kind, payload));
  return { value, hit: false };
}