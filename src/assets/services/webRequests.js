import { hud as defaultHud, t, lsGet, lsSet, lsDel, ttlGet, ttlSet, nowMs, sleep, stableStringify } from "@/lib/index.js";

const API_URL = "/.netlify/functions/api";

const DEFAULT_ALLOWED_KINDS = new Set([
  "public_stats",
  "user_privacy",
  "set_privacy",
  "delete_user_data",
  "delete_all_user_data",
  "user_messages_series",
  "user_voice_series",
  "user_activities_series",
  "user_commands_series",
  "user_profile_stats",
  "guild_messages_series",
  "guild_voice_series",
  "guild_activities_series",
  "guild_members_series",
  "guild_profile_stats",
  "user_guilds",
  "leaderboard",
  "get_guild_config",
  "save_guild_config"
]);

function resultCacheKey(userId, kind, payload) {
  return `api_cache:${userId}:${kind}:${stableStringify(payload || {})}`;
}

function activeKey(userId, kind, payload) {
  return `active_api:${userId}:${kind}:${stableStringify(payload || {})}`;
}

function publicCacheKey(kind, payload) {
  return `api_public_cache:${kind}:${stableStringify(payload || {})}`;
}

function makeError(message, extra = {}) {
  const err = new Error(String(message || "UNKNOWN_ERROR"));
  Object.assign(err, extra);
  return err;
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return payload;
}

function byteLen(value) {
  return new TextEncoder().encode(JSON.stringify(value ?? {})).length;
}

function validateClientRequest(kind, payload, {
  allowedKinds,
  maxPayloadBytes
}) {
  if (!kind || typeof kind !== "string") {
    throw makeError("MISSING_KIND", { code: "MISSING_KIND" });
  }

  if (allowedKinds && !allowedKinds.has(kind)) {
    throw makeError("UNKNOWN_KIND_CLIENT", { code: "UNKNOWN_KIND_CLIENT", kind });
  }

  if (byteLen(payload) > maxPayloadBytes) {
    throw makeError("PAYLOAD_TOO_LARGE_CLIENT", { code: "PAYLOAD_TOO_LARGE_CLIENT" });
  }
}

async function postApi(body, {
  token = null,
  requestTimeoutMs = 20_000
} = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), requestTimeoutMs);

  try {
    const headers = {
      "Content-Type": "application/json"
    };

    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      throw makeError(data?.error || `HTTP_${res.status}`, {
        status: res.status,
        code: data?.code || data?.error || `HTTP_${res.status}`,
        retryAfterMs: data?.retryAfterMs ?? null,
        details: data
      });
    }

    return data;
  } catch (e) {
    if (e?.name === "AbortError") {
      throw makeError("REQUEST_ABORTED", { code: "REQUEST_ABORTED" });
    }

    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function pollUntilDone(session, id, {
  timeoutMs,
  pollMinMs,
  pollMaxMs,
  statusRequestTimeoutMs
}) {
  const started = nowMs();
  let delay = pollMinMs;

  while (nowMs() - started < timeoutMs) {
    const left = timeoutMs - (nowMs() - started);

    const data = await postApi({
      mode: "status",
      id
    }, {
      token: session.access_token,
      requestTimeoutMs: Math.min(statusRequestTimeoutMs, Math.max(2_000, left))
    });

    if (data.status === "done") return data.result;

    if (data.status === "error") {
      throw makeError(data.error || "BOT_ERROR", { code: "BOT_ERROR" });
    }

    const waitMs = Math.min(
      Number(data.pollAfterMs || delay),
      pollMaxMs,
      Math.max(0, left)
    );

    if (waitMs <= 0) break;

    await sleep(waitMs);
    delay = Math.min(pollMaxMs, Math.floor(delay * 1.35));
  }

  throw makeError("timeout", { code: "TIMEOUT" });
}

function isMissingActiveRequestError(e) {
  return e?.status === 404 ||
    e?.status === 403 ||
    e?.code === "REQUEST_NOT_FOUND" ||
    e?.code === "REQUEST_FORBIDDEN" ||
    e?.code === "INVALID_REQUEST_ID";
}

export async function apiPublic(kind, payload = {}, {
  cacheTtlMs = 30_000,
  requestTimeoutMs = 10_000,
  maxPayloadBytes = 32 * 1024
} = {}) {
  payload = normalizePayload(payload);

  validateClientRequest(kind, payload, {
    allowedKinds: DEFAULT_ALLOWED_KINDS,
    maxPayloadBytes
  });

  const cKey = publicCacheKey(kind, payload);

  if (cacheTtlMs > 0) {
    const cached = ttlGet(cKey);
    if (cached != null) return cached;
  }

  const data = await postApi({
    kind,
    payload
  }, {
    requestTimeoutMs
  });

  if (data.status === "done") {
    if (cacheTtlMs > 0) ttlSet(cKey, data.result, cacheTtlMs);
    return data.result;
  }

  throw makeError("INVALID_PUBLIC_API_RESPONSE", {
    code: "INVALID_PUBLIC_API_RESPONSE",
    details: data
  });
}

export function createApiService(sb, {
  defaultCacheTtlMs = 30_000,
  defaultCooldownMs = 1_500,
  defaultTimeoutMs = 15_000,
  allowedKinds = DEFAULT_ALLOWED_KINDS,
  maxPayloadBytes = 64 * 1024,
  createRequestTimeoutMs = 25_000,
  statusRequestTimeoutMs = 12_000,
  pollMinMs = 700,
  pollMaxMs = 5_000,
  hud = defaultHud
} = {}) {
  const inflight = new Map();
  const cooldownUntil = new Map();

  async function requireSession() {
    const { data } = await sb.auth.getSession();
    const session = data?.session;

    if (!session?.access_token || !session?.user?.id) {
      throw makeError("NOT_LOGGED_IN", { code: "NOT_LOGGED_IN" });
    }

    return session;
  }

  async function resumeActiveIfExists(session, aKey, {
    timeoutMs
  }) {
    const savedId = lsGet(aKey, null);
    if (!savedId) return null;

    try {
      const data = await postApi({
        mode: "status",
        id: savedId
      }, {
        token: session.access_token,
        requestTimeoutMs: statusRequestTimeoutMs
      });

      if (data.status === "done") {
        lsDel(aKey);
        return {
          done: true,
          result: data.result
        };
      }

      if (data.status === "error") {
        lsDel(aKey);
        throw makeError(data.error || "BOT_ERROR", { code: "BOT_ERROR" });
      }

      const result = await pollUntilDone(session, savedId, {
        timeoutMs,
        pollMinMs,
        pollMaxMs,
        statusRequestTimeoutMs
      });

      lsDel(aKey);

      return {
        done: true,
        result
      };
    } catch (e) {
      if (isMissingActiveRequestError(e)) {
        lsDel(aKey);
        return null;
      }

      throw e;
    }
  }

  async function queue(kind, payload = {}, opts = {}) {
    payload = normalizePayload(payload);

    const cacheTtlMs = opts.cacheTtlMs ?? defaultCacheTtlMs;
    const cooldownMs = opts.cooldownMs ?? defaultCooldownMs;
    const timeoutMs = opts.timeoutMs ?? defaultTimeoutMs;

    validateClientRequest(kind, payload, {
      allowedKinds,
      maxPayloadBytes
    });

    const session = await requireSession();
    const userId = session.user.id;

    const rKey = resultCacheKey(userId, kind, payload);
    const aKey = activeKey(userId, kind, payload);

    if (cacheTtlMs > 0) {
      const cached = ttlGet(rKey);
      if (cached != null) return cached;
    }

    const running = inflight.get(rKey);
    if (running) return running;

    const stopHud = typeof hud?.loading === "function"
      ? hud.loading(kind)
      : () => { };

    const p = (async () => {
      try {
        const cdKey = `cd:${userId}:${kind}`;
        const cd = cooldownUntil.get(cdKey) || 0;

        if (cd > nowMs()) await sleep(cd - nowMs());
        cooldownUntil.set(cdKey, nowMs() + cooldownMs);

        const resumed = await resumeActiveIfExists(session, aKey, { timeoutMs });

        if (resumed?.done) {
          if (cacheTtlMs > 0) ttlSet(rKey, resumed.result, cacheTtlMs);
          return resumed.result;
        }

        const data = await postApi({
          kind,
          payload,
          timeoutMs
        }, {
          token: session.access_token,
          requestTimeoutMs: Math.min(createRequestTimeoutMs, Math.max(5_000, timeoutMs + 2_000))
        });

        if (data.id) lsSet(aKey, data.id);

        if (data.status === "done") {
          lsDel(aKey);
          if (cacheTtlMs > 0) ttlSet(rKey, data.result, cacheTtlMs);
          return data.result;
        }

        if (data.status === "error") {
          lsDel(aKey);
          throw makeError(data.error || "BOT_ERROR", { code: "BOT_ERROR" });
        }

        if (data.status === "pending" && data.id) {
          const result = await pollUntilDone(session, data.id, {
            timeoutMs,
            pollMinMs,
            pollMaxMs,
            statusRequestTimeoutMs
          });

          lsDel(aKey);
          if (cacheTtlMs > 0) ttlSet(rKey, result, cacheTtlMs);
          return result;
        }

        throw makeError("INVALID_API_RESPONSE", {
          code: "INVALID_API_RESPONSE",
          details: data
        });
      } catch (e) {
        if (typeof hud?.error === "function") {
          hud.error(e, {
            title: t("error.loading_title")
          });
        }

        throw e;
      } finally {
        stopHud();
      }
    })();

    inflight.set(rKey, p);

    try {
      return await p;
    } finally {
      inflight.delete(rKey);
    }
  }

  function makeLatestDebouncedQueue({
    debounceMs = 200,
    kinds = new Set([
      "user_messages_series",
      "user_voice_series",
      "user_activities_series",
      "user_commands_series",
      "guild_messages_series",
      "guild_voice_series",
      "guild_activities_series",
      "guild_members_series"
    ])
  } = {}) {
    const timers = new Map();
    const latest = new Map();
    const running = new Set();

    async function run(kind) {
      if (running.has(kind)) return;

      const job = latest.get(kind);
      if (!job) return;

      running.add(kind);

      try {
        const res = await queue(job.kind, job.payload, job.opts);
        job.resolve(res);
      } catch (e) {
        job.reject(e);
      } finally {
        running.delete(kind);

        if (latest.get(kind) !== job) {
          run(kind);
        }
      }
    }

    return function debouncedQueue(kind, payload = {}, opts = {}) {
      if (!kinds.has(kind)) return queue(kind, payload, opts);

      return new Promise((resolve, reject) => {
        latest.set(kind, {
          kind,
          payload,
          opts,
          resolve,
          reject
        });

        const ti = timers.get(kind);
        if (ti) clearTimeout(ti);

        timers.set(kind, setTimeout(() => run(kind), debounceMs));
      });
    };
  }

  return {
    queue,
    makeLatestDebouncedQueue
  };
}

export const createWebRequestService = createApiService;
