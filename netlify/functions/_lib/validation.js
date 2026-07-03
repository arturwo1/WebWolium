export const DIRECT_KINDS = new Set([
  "public_stats",
  "user_privacy",
  "set_privacy",
  "delete_user_data",
  "delete_all_user_data",
  "user_activities_series",
  "guild_activities_series",
  "guild_members_series",
  "get_guild_config",
  "save_guild_config"
]);

export const BOT_KINDS = new Set([
  "user_profile_stats",
  "guild_profile_stats",
  "user_messages_series",
  "user_voice_series",
  "user_commands_series",
  "guild_messages_series",
  "guild_voice_series",
  "user_guilds",
  "leaderboard"
]);

export const ALL_KINDS = new Set([
  ...DIRECT_KINDS,
  ...BOT_KINDS
]);

export const METRICS = new Set([
  "bank_balance",
  "balance",
  "upgrade",
  "total_xp",
  "level",
  "experience",
  "total_balance",
  "message_count",
  "voice_time",
  "streak_votes",
  "votes",
  "commands",
  "activity_time"
]);

export const DELETE_ACTIONS = new Set([
  "messages",
  "voice",
  "activities",
  "economy",
  "analytics"
]);

export function normalizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return payload;
}

export function byteLen(value) {
  return new TextEncoder().encode(JSON.stringify(value ?? {})).length;
}

export function assertKnownKind(kind) {
  if (!kind || typeof kind !== "string") {
    const err = new Error("MISSING_KIND");
    err.status = 400;
    throw err;
  }

  if (!ALL_KINDS.has(kind)) {
    const err = new Error("UNKNOWN_KIND");
    err.status = 400;
    throw err;
  }
}

export function assertPayloadSize(payload, maxBytes = 64 * 1024) {
  if (byteLen(payload) > maxBytes) {
    const err = new Error("PAYLOAD_TOO_LARGE");
    err.status = 413;
    throw err;
  }
}

export function cleanText(value, maxLen = 120) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

export function safeBigIntString(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  return /^\d{1,25}$/.test(s) ? s : null;
}

export function clampInt(value, lo, hi, fallback) {
  const n = Number.parseInt(value, 10);
  const x = Number.isFinite(n) ? n : fallback;
  return Math.min(hi, Math.max(lo, x));
}

export function seriesParams(payload) {
  const MIN_BUCKET_MS = 1_000;
  const MAX_BUCKET_MS = 30 * 86400_000;
  const MIN_LIMIT = 80;
  const MAX_LIMIT = 800;

  let fromMs = clampInt(payload.from, 0, 10 ** 18, 0);
  let toMs = clampInt(payload.to, 0, 10 ** 18, 0);

  if (toMs <= fromMs) toMs = fromMs + 3600_000;

  let bucketMs = clampInt(payload.bucket_ms, MIN_BUCKET_MS, MAX_BUCKET_MS, 60_000);
  const limit = clampInt(payload.limit, MIN_LIMIT, MAX_LIMIT, 240);

  const rangeMs = toMs - fromMs;
  const minBucketNeeded = Math.max(MIN_BUCKET_MS, Math.floor(rangeMs / limit));

  if (bucketMs < minBucketNeeded) {
    bucketMs = Math.min(minBucketNeeded, MAX_BUCKET_MS);
  }

  return {
    fromMs,
    toMs,
    bucketMs,
    limit,
    guildId: safeBigIntString(payload.guild_id),
    channelId: safeBigIntString(payload.channel_id),
    context: cleanText(payload.context || payload.command_name || payload.activity_name)
  };
}

export function durationRangeSeconds(payload) {
  let minSec = payload.min_duration_seconds == null ? null : clampInt(payload.min_duration_seconds, 0, 10 ** 9, 0);
  let maxSec = payload.max_duration_seconds == null ? null : clampInt(payload.max_duration_seconds, 0, 10 ** 9, 0);

  if (minSec == null && payload.min_duration_ms != null && payload.min_duration_ms !== "") {
    minSec = Math.floor(clampInt(payload.min_duration_ms, 0, 10 ** 12, 0) / 1000);
  }

  if (maxSec == null && payload.max_duration_ms != null && payload.max_duration_ms !== "") {
    maxSec = Math.floor(clampInt(payload.max_duration_ms, 0, 10 ** 12, 0) / 1000);
  }

  if (minSec != null && maxSec != null && maxSec < minSec) {
    const tmp = minSec;
    minSec = maxSec;
    maxSec = tmp;
  }

  return {
    minSec,
    maxSec
  };
}
