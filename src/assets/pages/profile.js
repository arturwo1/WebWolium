import {
  $,
  lsJSONGet,
  lsJSONSet,
  readIdentity
} from "@/lib/index.js";

import { createWebRequestService } from "@/services/index.js";
import { initProfileChart } from "./profile_chart.js";

function setText(el, value) {
  if (el) el.textContent = String(value ?? "");
}

function formatMoneyEUR(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `€${v}`;
}

function setModalOpen(modal, open) {
  if (!modal) return;
  modal.classList.toggle("is-open", open);
  modal.setAttribute("aria-hidden", open ? "false" : "true");
}

function chartTitle(type) {
  if (type === "messages") return "Messages";
  if (type === "voice") return "Voice";
  if (type === "activities") return "Activities";
  return "Graphic";
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

  const statsRoot = $("#profileStats");
  const chartModal = $("#chartModal");
  const chartClose = $("#chartClose");
  const chartTitleEl = $("#chartTitle");

  if (!statsRoot || !chartModal || !chartClose || !chartTitleEl) return null;

  const wr = createWebRequestService(sb, {
    defaultCacheTtlMs: 30_000,
    defaultCooldownMs: 1_500,
    defaultTimeoutMs: 80_000
  });

  const queueChart = wr.makeLatestDebouncedQueue({
    debounceMs: 200,
    kinds: new Set(["messages_series", "voice_series"])
  });

  async function fillIdentity() {
    const cached = readIdentity();
    if (cached?.name) setText(profileTag, cached.name);
    if (profilePfp && cached?.avatar) profilePfp.src = cached.avatar;

    try {
      const { data } = await sb.auth.getSession();
      const u = data?.session?.user;
      if (!u) return;

      const m = u.user_metadata || {};
      const name = m.full_name || m.name || m.username || u.email || "User";
      const avatar = m.avatar_url || m.picture || null;

      setText(profileTag, name);
      if (profilePfp && avatar) profilePfp.src = avatar;
    } catch {}
  }

  function renderStats(res) {
    setText(statMessages, res?.messages ?? 0);
    setText(statVoice, res?.voice_time ?? "00:00");
    setText(statActivities, res?.activity_seconds ?? "00:00");

    setText(statMoneyTotal, formatMoneyEUR(res?.total_balance ?? 0));
    setText(statMoneyBank, formatMoneyEUR(res?.bank_balance ?? 0));
    setText(statMoneyCash, formatMoneyEUR(res?.balance ?? 0));

    setText(profileXpLine, `${res?.xp_now ?? 0}/${res?.xp_need ?? 0} (${res?.xp ?? 0}) XP`);
    setText(profileLevel, `${res?.lvl ?? 0} LvL`);

    if (profileXpBar) {
      const now = Number(res?.xp_now ?? 0);
      const need = Number(res?.xp_need ?? 0);
      const pct = need > 0 ? (now / need) * 100 : 0;
      profileXpBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    }

    setText(profileName, res?.user_name ?? "Unknown Name");
  }

  async function loadStats() {
    const { data } = await sb.auth.getSession();
    const userId = data?.session?.user?.id || "anon";
    const lastKey = `wolium:last_profile_stats:${userId}`;

    try {
      const res = await wr.queue("profile_stats", {}, {
        cacheTtlMs: 30_000,
        cooldownMs: 1_500,
        timeoutMs: 80_000
      });

      lsJSONSet(lastKey, { t: Date.now(), res });
      renderStats(res);
      return res;
    } catch (e) {
      const saved = lsJSONGet(lastKey, null);
      if (saved?.res) {
        renderStats(saved.res);
        return saved.res;
      }
      throw e;
    }
  }

  await fillIdentity();

  let chart = null;
  try {
    await loadStats();
  } catch (e) {
    console.warn("[profile] init failed:", e);
  }

  function ensureChart() {
    if (chart) return chart;
    chart = initProfileChart(queueChart, {
      cacheTtlMs: 30_000,
      cooldownMs: 1_500,
      timeoutMs: 80_000,
      defaultDays: 30,
      viewer: {
        name: profileName?.textContent || profileTag?.textContent || "User",
        avatar: profilePfp?.src || null
      }
    });
    return chart;
  }

  function openChart(type) {
    setText(chartTitleEl, chartTitle(type));
    setModalOpen(chartModal, true);

    const existed = !!chart;
    const c = ensureChart();
    if (existed) c?.setType(type);
    else if (type && type !== "messages") c?.setType(type);
  }

  function closeChart() {
    setModalOpen(chartModal, false);
  }

  statsRoot.addEventListener("click", (e) => {
    const btn = e.target.closest(".stat--link");
    const type = btn?.dataset?.chart;
    if (!type) return;
    openChart(type);
  });

  chartClose.addEventListener("click", closeChart);
  chartModal.addEventListener("click", (e) => {
    if (e.target === chartModal) closeChart();
  });

  setText(chartTitleEl, "Graphic");

  return chart;
}
