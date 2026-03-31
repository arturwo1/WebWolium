import {
  $,
  lsJSONGet,
  lsJSONSet,
  readIdentity
} from "@/lib/index.js";

import { createWebRequestService } from "@/services/index.js";
import { initProfileChart } from "./profile_chart.js";
import { t, onLangChange } from "@/lib/text/i18n.js";

function setText(el, value) {
  if (el) el.textContent = String(value ?? "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function hasSpriteSymbol(id) {
  if (!id) return false;
  return !!document.getElementById(String(id));
}

const CLIENT_ICON_IDS = {
  desktop: "desktop",
  mobile: "mobile",
  web: "web"
};

const CLIENT_LABEL_KEYS = {
  desktop: "profile.client.desktop",
  mobile: "profile.client.mobile",
  web: "profile.client.web"
};

function statusLabelKey(status) {
  return `profile.status.${String(status ?? "").trim()}`;
}

function setPresenceTooltipOpen(tooltipEl, open) {
  if (!tooltipEl || tooltipEl.hidden) return;

  tooltipEl.classList.toggle("is-on", open);
  tooltipEl.setAttribute("aria-hidden", open ? "false" : "true");
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
  if (type === "messages") return t("chart.type.messages");
  if (type === "voice") return t("chart.type.voice");
  if (type === "activities") return t("chart.type.activities");
  return t("chart.title");
}

function renderPresenceBadgeState({ badgeEl, useEl, tooltipEl, status, clientStatus }) {
  if (!badgeEl || !useEl || !tooltipEl) return;

  const statusId = String(status ?? "").trim();

  if (!statusId || !hasSpriteSymbol(statusId)) {
    badgeEl.hidden = true;
    tooltipEl.hidden = true;
    tooltipEl.innerHTML = "";
    tooltipEl.classList.remove("is-on");
    tooltipEl.setAttribute("aria-hidden", "true");
    return;
  }

  useEl.setAttribute("href", `#${statusId}`);
  badgeEl.hidden = false;
  badgeEl.setAttribute("aria-label", t(statusLabelKey(statusId)));

  const rows = [];
  const order = ["desktop", "mobile", "web"];

  for (const key of order) {
    const rawClientStatus = String(clientStatus?.[key] ?? "").trim();
    if (!rawClientStatus) continue;
    if (!hasSpriteSymbol(rawClientStatus)) continue;

    const clientIconId = CLIENT_ICON_IDS[key];
    if (!hasSpriteSymbol(clientIconId)) continue;

    rows.push(`
      <div class="presence-tooltip__row">
        <div class="presence-tooltip__left">
          <svg class="icon presence-tooltip__device" aria-hidden="true" viewBox="0 0 24 24">
            <use href="#${clientIconId}"></use>
          </svg>

          <span class="presence-tooltip__label">
            ${escapeHtml(t(CLIENT_LABEL_KEYS[key]))}
          </span>
        </div>

        <svg class="icon presence-tooltip__status" aria-hidden="true" viewBox="0 0 24 24">
          <use href="#${rawClientStatus}"></use>
        </svg>
      </div>
    `);
  }

  if (!rows.length) {
    tooltipEl.hidden = true;
    tooltipEl.innerHTML = "";
    tooltipEl.classList.remove("is-on");
    tooltipEl.setAttribute("aria-hidden", "true");
    return;
  }

  tooltipEl.innerHTML = `
    <div class="presence-tooltip__list">
      ${rows.join("")}
    </div>
  `;
  tooltipEl.hidden = false;
  tooltipEl.classList.remove("is-on");
  tooltipEl.setAttribute("aria-hidden", "true");
}

function renderBadgeRow(badgeRowEl, badges) {
  if (!badgeRowEl) return;

  let list = badges;

  if (typeof badges === "string") {
    try {
      list = JSON.parse(badges);
    } catch {
      list = [];
    }
  }

  if (!Array.isArray(list)) list = [];

  const validBadges = list
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .filter((id) => hasSpriteSymbol(id));

  if (!validBadges.length) {
    badgeRowEl.innerHTML = "";
    badgeRowEl.hidden = true;
    return;
  }

  badgeRowEl.innerHTML = validBadges.map((badgeId) => `
    <div
      class="badge"
      title="${escapeHtml(t(`profile.badges.${badgeId}`))}"
      aria-label="${escapeHtml(t(`profile.badges.${badgeId}`))}"
    >
      <svg class="icon badge-icon" aria-hidden="true" viewBox="0 0 24 24">
        <use href="#${badgeId}"></use>
      </svg>
    </div>
  `).join("");

  badgeRowEl.hidden = false;
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
  const profileXpBarContainer = $("#profileXpBarContainer");
  const profileLevel = $("#profileLevel");

  const profilePfp = $("#profilePfp");
  const profileName = $("#profileName");
  const profileTag = $("#profileTag");

  const profilePresenceBadge = $("#profilePresenceBadge");
  const profilePresenceUse = $("#profilePresenceUse");
  const profilePresenceTooltip = $("#profilePresenceTooltip");
  const profileBadges = $("#profileBadges");
  const profilePfpWrap = profilePresenceBadge?.closest(".pfp-wrap") || null;

  const statsRoot = $("#profileStats");
  const chartModal = $("#chartModal");
  const chartClose = $("#chartClose");
  const chartTitleEl = $("#chartTitle");

  const chartGuildId = $("#chartGuildId");
  const chartChannelId = $("#chartChannelId");

  const Ids = {
    guilds: {}
  }

  if (!statsRoot || !chartModal || !chartClose || !chartTitleEl) return null;

  const wr = createWebRequestService(sb, {
    defaultCacheTtlMs: 30_000,
    defaultCooldownMs: 1_500,
    defaultTimeoutMs: 15_000
  });

  const queueChart = wr.makeLatestDebouncedQueue({
    debounceMs: 200,
    kinds: new Set(["messages_series", "voice_series", "activities_series"])
  });

  let lastProfileResponse = null;

  async function fillIdentity() {
    const cached = readIdentity();
    if (cached?.name) setText(profileTag, cached.name);
    if (profilePfp && cached?.avatar) profilePfp.src = cached.avatar;

    try {
      const { data } = await sb.auth.getSession();
      const u = data?.session?.user;
      if (!u) return;

      const m = u.user_metadata || {};
      const name = m.full_name || m.name || m.username || u.email || t("common.user");
      const avatar = m.avatar_url || m.picture || null;

      setText(profileTag, name);
      if (profilePfp && avatar) profilePfp.src = avatar;
    } catch { }
  }

  function renderStats(res) {
    lastProfileResponse = res ?? null;

    setText(statMessages, res?.messages ?? 0);
    setText(statVoice, res?.voice_time ?? "00:00");
    setText(statActivities, res?.activity_seconds ?? "00:00");

    setText(statMoneyTotal, formatMoneyEUR(res?.total_balance ?? 0));
    setText(statMoneyBank, formatMoneyEUR(res?.bank_balance ?? 0));
    setText(statMoneyCash, formatMoneyEUR(res?.balance ?? 0));

    setText(profileXpLine, t("profile.xp_line", {
      now: res?.xp_now ?? 0,
      need: res?.xp_need ?? 0,
      total: res?.xp ?? 0
    }));

    setText(profileLevel, t("profile.level", { level: res?.lvl ?? 0 }));

    if (profileXpBar) {
      const now = Number(res?.xp_now ?? 0);
      const need = Number(res?.xp_need ?? 0);
      const pct = need > 0 ? (now / need) * 100 : 0;

      profileXpBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      profileXpBarContainer.ariaValueNow = Math.round(Math.min(100, Math.max(0, pct)));
    }

    setText(profileName, res?.user_name ?? t("profile.unknown_name"));

    if (profilePfp && res?.user_avatar) {
      profilePfp.src = res.user_avatar;
    }

    renderPresenceBadgeState({
      badgeEl: profilePresenceBadge,
      useEl: profilePresenceUse,
      tooltipEl: profilePresenceTooltip,
      status: res?.status,
      clientStatus: res?.client_status
    });

    renderBadgeRow(profileBadges, res?.badges);
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

      Ids["guilds"] = res?.guilds;

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

  if (profilePfpWrap && profilePresenceTooltip) {
    profilePfpWrap.addEventListener("mouseenter", () => {
      setPresenceTooltipOpen(profilePresenceTooltip, true);
    });

    profilePfpWrap.addEventListener("mouseleave", () => {
      setPresenceTooltipOpen(profilePresenceTooltip, false);
    });

    profilePfpWrap.addEventListener("focusin", () => {
      setPresenceTooltipOpen(profilePresenceTooltip, true);
    });

    profilePfpWrap.addEventListener("focusout", () => {
      setPresenceTooltipOpen(profilePresenceTooltip, false);
    });
  }

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
        name: profileName?.textContent || profileTag?.textContent || t("common.user"),
        avatar: profilePfp?.src || null
      }
    });
    return chart;
  }

  function openChart(type) {
    chartModal.dataset.chartType = type || "messages";
    setText(chartTitleEl, chartTitle(type));
    setModalOpen(chartModal, true);

    const existed = !!chart;
    const c = ensureChart();
    if (existed) c?.setType(type);
    else if (type && type !== "messages") c?.setType(type);

    for (const [gId, gProps] of Object.entries(Ids["guilds"])) {
      const gOption = document.createElement("option");
      gOption.value = gId;
      gOption.textContent = gProps.name;
      chartGuildId.appendChild(gOption);
    }

    chartGuildId.addEventListener("change", (e) => {
      const value = e.target.value;

      chartChannelId.innerHTML = "";
      const opt = document.createElement("option");
      opt.value = "";
      opt.selected = true;

      const channels = Ids["guilds"][value]?.channels;
      if (!channels) {
        chartChannelId.disabled = true; 
        opt.disabled = true;
        opt.textContent = t("chart.preset.channel.locked");
        chartChannelId.appendChild(opt);
        return;
      }

      opt.textContent = t("chart.preset.channel");
      chartChannelId.appendChild(opt);

      for (const [cId, cProps] of Object.entries(channels)) {
        const cOption = document.createElement("option");
        cOption.value = cId;
        cOption.textContent = cProps.name;
        chartChannelId.appendChild(cOption);
      }
      chartChannelId.disabled = false;
    });
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

  setText(chartTitleEl, t("chart.title"));

  onLangChange(() => {
    const currentType = chartModal?.dataset?.chartType || "messages";

    if (chartModal?.classList.contains("is-open")) {
      setText(chartTitleEl, chartTitle(currentType));
    } else {
      setText(chartTitleEl, t("chart.title"));
    }

    if (lastProfileResponse) {
      renderPresenceBadgeState({
        badgeEl: profilePresenceBadge,
        useEl: profilePresenceUse,
        tooltipEl: profilePresenceTooltip,
        status: lastProfileResponse?.status,
        clientStatus: lastProfileResponse?.client_status
      });

      renderBadgeRow(profileBadges, lastProfileResponse?.badges);
    }
  });

  return chart;
}
