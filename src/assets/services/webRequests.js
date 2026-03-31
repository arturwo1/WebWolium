import { t } from "@/lib/text/i18n.js";
import { stableStringify } from "@/lib/index.js";
import { nowMs, sleep } from "@/lib/index.js";
import { ttlGet, ttlSet } from "@/lib/index.js";
import { lsGet, lsSet, lsDel } from "@/lib/index.js";
import { hud as defaultHud } from "@/lib/index.js";

function parseReject(err) {
  const msg = String(err?.message || "");
  const mReason = /REJECT:([A-Z0-9_]+)/i.exec(msg);
  const mRetry = /RETRY_AFTER_MS=(\d+)/i.exec(msg);
  return {
    reason: mReason ? mReason[1].toUpperCase() : null,
    retryAfterMs: mRetry ? Number(mRetry[1]) : null,
    msg
  };
}

async function rpcCreateWithCooldown(sb, kind, payload, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const { data: id, error } = await sb.rpc("create_web_request", {
      p_kind: kind,
      p_payload: payload
    });

    if (!error) return id;

    if (String(error.code || "") === "P0001") {
      const p = parseReject(error);
      if (p.retryAfterMs != null) {
        await sleep(Math.min(30_000, p.retryAfterMs + 50));
        continue;
      }
    }

    throw error;
  }

  throw new Error("RPC_REJECTED_TOO_MANY_TIMES");
}

async function waitWebRequestDone(sb, id, timeoutMs = 15_000) {
  return await new Promise((resolve, reject) => {
    const channel = sb.channel(`wr:${id}`);
    let finished = false;

    let pollTimer = null;
    let pollDelay = 500;
    const pollMax = 15_000;

    const cleanup = () => {
      if (pollTimer) clearTimeout(pollTimer);
      sb.removeChannel(channel);
    };

    const finishOk = (result) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(result);
    };

    const finishErr = (err) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const checkOnce = async () => {
      const { data, error } = await sb
        .from("web_requests")
        .select("status,result,error")
        .eq("id", id)
        .single();

      if (error || !data) return { status: "unknown" };

      if (data.status === "done") {
        finishOk(data.result);
        return { status: "done" };
      }

      if (data.status === "error") {
        finishErr(data.error || "bot error");
        return { status: "error" };
      }

      return { status: data.status || "pending" };
    };

    const schedulePoll = async () => {
      if (finished) return;
      await checkOnce();
      if (finished) return;
      pollDelay = Math.min(pollMax, Math.floor(pollDelay * 1.4));
      pollTimer = setTimeout(schedulePoll, pollDelay);
    };

    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "web_requests", filter: `id=eq.${id}` },
      (ev) => {
        const row = ev.new;
        if (row?.status === "done") finishOk(row.result);
        else if (row?.status === "error") finishErr(row.error || "bot error");
      }
    );

    channel.subscribe(async (st) => {
      await checkOnce();
      if (finished) return;

      if (st === "SUBSCRIBED" || st === "CHANNEL_ERROR" || st === "TIMED_OUT") {
        if (!pollTimer) pollTimer = setTimeout(schedulePoll, pollDelay);
      }
    });

    setTimeout(() => {
      checkOnce().finally(() => {
        if (!finished) finishErr(new Error("timeout"));
      });
    }, timeoutMs);
  });
}

function resultCacheKey(userId, kind, payload) {
  return `wr_cache:${userId}:${kind}:${stableStringify(payload || {})}`;
}

function activeKey(userId, kind, payload) {
  return `active_wr:${userId}:${kind}:${stableStringify(payload || {})}`;
}

export function createWebRequestService(sb, {
  defaultCacheTtlMs = 30_000,
  defaultCooldownMs = 1_500,
  defaultTimeoutMs = 15_000,
  createTries = 8,
  hud = defaultHud
} = {}) {
  const inflight = new Map();
  const cooldownUntil = new Map();

  async function requireUserId() {
    const { data } = await sb.auth.getSession();
    const session = data?.session;
    if (!session) throw new Error("NOT_LOGGED_IN");
    return session.user.id;
  }

  async function queue(kind, payload = {}, opts = {}) {
    const cacheTtlMs = opts.cacheTtlMs ?? defaultCacheTtlMs;
    const cooldownMs = opts.cooldownMs ?? defaultCooldownMs;
    const timeoutMs = opts.timeoutMs ?? defaultTimeoutMs;

    const userId = await requireUserId();

    const rKey = resultCacheKey(userId, kind, payload);
    const aKey = activeKey(userId, kind, payload);

    const cached = ttlGet(rKey);
    if (cached != null) return cached;

    const running = inflight.get(rKey);
    if (running) return running;

    const stopHud = typeof hud?.loading === "function"
      ? hud.loading(kind)
      : () => {};

    const p = (async () => {
      try {
        const cdKey = `cd:${userId}:${kind}`;
        const cd = cooldownUntil.get(cdKey) || 0;
        if (cd > nowMs()) await sleep(cd - nowMs());
        cooldownUntil.set(cdKey, nowMs() + cooldownMs);

        const savedId = lsGet(aKey, null);
        if (savedId) {
          const { data } = await sb
            .from("web_requests")
            .select("status,result,error")
            .eq("id", savedId)
            .single();

          if (data?.status === "done") {
            ttlSet(rKey, data.result, cacheTtlMs);
            lsDel(aKey);
            return data.result;
          }

          if (data?.status === "pending") {
            const res = await waitWebRequestDone(sb, savedId, timeoutMs);
            ttlSet(rKey, res, cacheTtlMs);
            lsDel(aKey);
            return res;
          }

          lsDel(aKey);
        }

        const id = await rpcCreateWithCooldown(sb, kind, payload, createTries);
        lsSet(aKey, id);

        const res = await waitWebRequestDone(sb, id, timeoutMs);
        lsDel(aKey);

        ttlSet(rKey, res, cacheTtlMs);
        return res;
      } catch (e) {
        if (typeof hud?.error === "function") hud.error(e, { title: t("error.loading_title") });
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
    kinds = new Set(["messages_series", "voice_series", "activities_series"])
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
        if (latest.get(kind) !== job) run(kind);
      }
    }

    return function debouncedQueue(kind, payload = {}, opts = {}) {
      if (!kinds.has(kind)) return queue(kind, payload, opts);

      return new Promise((resolve, reject) => {
        latest.set(kind, { kind, payload, opts, resolve, reject });

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
