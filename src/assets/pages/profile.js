import { initProfileChart } from "./profile_chart.js";

const $ = (s, r = document) => r.querySelector(s);

const MEM_CACHE = new Map();
const INFLIGHT = new Map();
const COOLDOWN_UNTIL = new Map();

function nowMs() {
  return Date.now();
}

function stableStringify(obj) {
  if (!obj || typeof obj !== "object") return String(obj ?? "");
  const keys = Object.keys(obj).sort();
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return JSON.stringify(out);
}

function cacheGet(key) {
  const m = MEM_CACHE.get(key);
  if (m && m.exp > nowMs()) return m.val;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && obj.exp > nowMs()) {
      MEM_CACHE.set(key, obj);
      return obj.val;
    }
  } catch { }
  return null;
}

function cacheSet(key, val, ttlMs) {
  const obj = { exp: nowMs() + ttlMs, val };
  MEM_CACHE.set(key, obj);
  try {
    localStorage.setItem(key, JSON.stringify(obj));
  } catch { }
}

function resultCacheKey(userId, kind, payload) {
  return `wr_cache:${userId}:${kind}:${stableStringify(payload || {})}`;
}

function activeKey(userId, kind, payload) {
  return `active_wr:${userId}:${kind}:${stableStringify(payload || {})}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function rpcCreateWithCooldown(sb, kind, payload, tries = 4) {
  let delay = 1200;

  for (let i = 0; i < tries; i++) {
    const { data: id, error } = await sb.rpc("create_web_request", {
      p_kind: kind,
      p_payload: payload
    });

    if (!error) return id;

    const msg = String(error.message || "");
    const code = String(error.code || "");

    if (code === "P0001" && msg.toLowerCase().includes("cooldown")) {
      await sleep(delay);
      delay = Math.min(10_000, Math.floor(delay * 1.7));
      continue;
    }

    throw error;
  }

  throw new Error("cooldown");
}

async function waitWebRequestDone(sb, id, timeoutMs = 80_000) {
  return await new Promise((resolve, reject) => {
    const channel = sb.channel(`wr:${id}`);
    let finished = false;

    let pollTimer = null;
    let pollDelay = 2_000;
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

export async function queueRequest(sb, kind, payload = {}, opts = {}) {
  const cacheTtlMs = opts.cacheTtlMs ?? 30_000;
  const cooldownMs = opts.cooldownMs ?? 1_500;
  const timeoutMs = opts.timeoutMs ?? 80_000;

  const { data: sessData } = await sb.auth.getSession();
  const session = sessData?.session;
  if (!session) throw new Error("NOT_LOGGED_IN");

  const userId = session.user.id;

  const rKey = resultCacheKey(userId, kind, payload);
  const aKey = activeKey(userId, kind, payload);

  const cached = cacheGet(rKey);
  if (cached != null) return cached;

  const running = INFLIGHT.get(rKey);
  if (running) return running;

  const p = (async () => {
    const cd = COOLDOWN_UNTIL.get(rKey) || 0;
    if (cd > nowMs()) await sleep(cd - nowMs());
    COOLDOWN_UNTIL.set(rKey, nowMs() + cooldownMs);

    const savedId = localStorage.getItem(aKey);
    if (savedId) {
      const { data } = await sb
        .from("web_requests")
        .select("status,result,error")
        .eq("id", savedId)
        .single();

      if (data?.status === "done") {
        cacheSet(rKey, data.result, cacheTtlMs);
        localStorage.removeItem(aKey);
        return data.result;
      }

      if (data?.status === "pending") {
        const res = await waitWebRequestDone(sb, savedId, timeoutMs);
        cacheSet(rKey, res, cacheTtlMs);
        localStorage.removeItem(aKey);
        return res;
      }

      localStorage.removeItem(aKey);
    }

    const id = await rpcCreateWithCooldown(sb, kind, payload);
    localStorage.setItem(aKey, id);

    const res = await waitWebRequestDone(sb, id, timeoutMs);

    localStorage.removeItem(aKey);
    cacheSet(rKey, res, cacheTtlMs);
    return res;
  })();

  INFLIGHT.set(rKey, p);
  try {
    return await p;
  } finally {
    INFLIGHT.delete(rKey);
  }
}

export async function initProfilePage(sb) {
  const statMessages = $("#statMessages");
  const statVoice = $("#statVoice");
  const statActivities = $("#statActivities");
  const statMoneyTotal = $("#statMoneyTotal");
  const statMoneyBank = $("#statMoneyBank");
  const statMoneyCash = $("#statMoneyCash");
  const profileXpLine = $("#profileXpLine");
  const profileXpBar = $("#profileXpBar");
  const profileLevel = $("#profileLevel");

  const profilePfp = $("#profilePfp");
  const profileName = $("#profileName");
  const profileTag = $("#profileTag");

  async function fillIdentity() {
    try {
      const { data } = await sb.auth.getSession();
      const u = data?.session?.user;
      if (!u) return;

      const m = u.user_metadata || {};
      const name = m.full_name || m.name || m.username || u.email || "User";
      const avatar = m.avatar_url || m.picture || null;

      if (profileTag) profileTag.textContent = name;
      if (profilePfp && avatar) profilePfp.src = avatar;
    } catch { }
  }

  async function loadStats() {
    const res = await queueRequest(sb, "profile_stats", {}, {
      cacheTtlMs: 30_000,
      cooldownMs: 1_500,
      timeoutMs: 80_000
    });

    if (statMessages) statMessages.textContent = String(res?.messages ?? 0);
    if (statVoice) statVoice.textContent = String(res?.voice_time ?? "00:00");
    if (statActivities) statActivities.textContent = String(res?.activity_seconds ?? "00:00");

    if (statMoneyTotal) statMoneyTotal.textContent = "€" + String(Math.round((res?.total_balance ?? 0) * 100) / 100);
    if (statMoneyBank) statMoneyBank.textContent = "€" + String(Math.round((res?.bank_balance ?? 0) * 100) / 100);
    if (statMoneyCash) statMoneyCash.textContent = "€" + String(Math.round((res?.balance ?? 0) * 100) / 100);

    if (profileXpLine) profileXpLine.textContent = `${res?.xp_now ?? 0}/${res?.xp_need ?? 0} (${res?.xp ?? 0}) XP`;
    if (profileLevel) profileLevel.textContent = `${res?.lvl ?? 0} LvL`;

    if (profileXpBar) {
      const now = Number(res?.xp_now ?? 0);
      const need = Number(res?.xp_need ?? 0);
      const pct = need > 0 ? (now / need) * 100 : 0;
      profileXpBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    }

    if (profileName) profileName.textContent = String(res?.user_name ?? "Unknown Name");
  }

  await fillIdentity();

  try {
    await loadStats();

    const chart = initProfileChart(sb, queueRequest, {
      cacheTtlMs: 30_000,
      cooldownMs: 1_500,
      timeoutMs: 80_000,
      defaultDays: 30,
      snapMs: 60_000
    });

    document.querySelectorAll("[data-chart]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = String(btn.getAttribute("data-chart") || "");
        chart?.setType(t);
      });
    });

    return chart;
  } catch (e) {
    console.warn("[profile_stats] failed:", e);
    if (statMessages) statMessages.textContent = "0";
    if (statVoice) statVoice.textContent = "00:00";
    if (statActivities) statActivities.textContent = "00:00";
    if (statMoneyTotal) statMoneyTotal.textContent = "€0";
    if (statMoneyBank) statMoneyBank.textContent = "€0";
    if (statMoneyCash) statMoneyCash.textContent = "€0";
    if (profileName) profileName.textContent = "—";
    return null;
  }
}
