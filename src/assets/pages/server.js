import { $, lsJSONGet, lsJSONSet, lsCleanExpired, escapeHtml, t, onLangChange, hud, formatNumber, on } from "@/lib/index.js";

import { createWebRequestService } from "@/services/index.js";
import { initChart } from "@/lib/chart/chart.js";

const SERVER_TABS = new Set(["analytics", "settings"]);

function setText(el, value) {
  if (el) el.textContent = String(value ?? "");
}

function setHidden(el, hidden) {
  if (el) el.hidden = Boolean(hidden);
}

function hasSpriteSymbol(id) {
  if (!id) return false;
  return !!document.getElementById(String(id));
}

function normalizeChartType(type) {
  if (type === "voice" || type === "guild_voice") return "guild_voice";
  if (type === "activities" || type === "guild_activities") return "guild_activities";
  if (type === "members" || type === "guild_members") return "guild_members";
  return "guild_messages";
}

function normalizeServerTab(tab) {
  return SERVER_TABS.has(tab) ? tab : "analytics";
}

function formatMoney(n) {
  return `${formatNumber(n)}₩`;
}

function setModalOpen(modal, open) {
  if (!modal) return;
  modal.classList.toggle("is-open", open);
  modal.setAttribute("aria-hidden", open ? "false" : "true");
}

function chartTitle(type) {
  if (type === "guild_messages") return t("profile.messages");
  if (type === "guild_voice") return t("profile.voice");
  if (type === "guild_activities") return t("profile.activities");
  if (type === "guild_members") return t("server.analytics.members");
  return t("chart.title");
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

  badgeRowEl.innerHTML = validBadges.map((badgeId) => {
    const title = t(`server.badges.${badgeId}`);

    return `
      <div
        class="badge"
        title="${escapeHtml(title)}"
        aria-label="${escapeHtml(title)}"
      >
        <svg class="icon badge-icon" aria-hidden="true" viewBox="0 0 24 24">
          <use href="#${badgeId}"></use>
        </svg>
      </div>
    `;
  }).join("");

  badgeRowEl.hidden = false;
}

function getParam(key) {
  const params = new URLSearchParams(window.location.search);
  return (params.get(key) || "").trim();
}

function readServerTab() {
  return normalizeServerTab(getParam("tab"));
}

function writeServerTab(tab, replace = false) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", normalizeServerTab(tab));

  const method = replace ? "replaceState" : "pushState";
  window.history[method]({}, "", url);
}

export async function initServerPage(sb) {
  const serverApp = $("#serverApp");

  const statMessages = $("#statMessages");
  const statVoice = $("#statVoice");
  const statActivities = $("#statActivities");
  const statMoneyTotal = $("#statMoneyTotal");
  const statMoneyBank = $("#statMoneyBank");
  const statMoneyCash = $("#statMoneyCash");
  const statMembers = $("#statMembers");
  const profileXpLine = $("#profileXpLine");
  const profileXpBar = $("#profileXpBar");
  const profileXpBarContainer = $("#profileXpBarContainer");
  const profileLevel = $("#profileLevel");

  const profilePfp = $("#profilePfp");
  const profileName = $("#profileName");

  const profileBadges = $("#profileBadges");

  const profileRoot = $("#profileCard");
  const statsRoot = $("#profileStats");

  const serverBotMissing = $("#serverBotMissing");
  const serverTabs = Array.from(document.querySelectorAll("[data-server-tab]"));
  const serverViews = Array.from(document.querySelectorAll("[data-server-view]"));

  const chartModal = $("#chartModal");
  const chartClose = $("#chartClose");
  const chartTitleEl = $("#chartTitle");
  const chartTabs = Array.from(document.querySelectorAll("[data-chart-type]"));
  const chartChannelId = $("#chartChannelId");
  const chartRoleId = $("#chartRoleId");

  const guildId = getParam("guild_id") || "";

  const Ids = {
    channels: {},
    roles: {}
  };

  if (!serverApp || !serverBotMissing || !statsRoot || !profileRoot || !chartModal || !chartClose || !chartTitleEl || !chartChannelId || !guildId) {
    return null;
  }

  for (const tab of chartTabs) {
    if (!String(tab.dataset.chartType || "").startsWith("guild_")) {
      tab.dataset.chartType = `guild_${tab.dataset.chartType}`;
    }
  }

  const wr = createWebRequestService(sb, {
    defaultCacheTtlMs: 30_000,
    defaultCooldownMs: 1_500,
    defaultTimeoutMs: 15_000
  });

  const queueChart = wr.makeLatestDebouncedQueue({
    debounceMs: 200,
    kinds: new Set(["guild_messages_series", "guild_voice_series", "guild_activities_series", "guild_members_series"]),
  });

  let lastProfileResponse = null;
  let chart = null;

  function setActiveTab(tab, options = {}) {
    const normalizedTab = normalizeServerTab(tab);

    serverApp.dataset.tab = normalizedTab;

    for (const button of serverTabs) {
      const active = button.dataset.serverTab === normalizedTab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.setAttribute("tabindex", active ? "0" : "-1");
    }

    for (const view of serverViews) {
      view.hidden = view.dataset.serverView !== normalizedTab;
    }

    if (options.updateUrl) {
      writeServerTab(normalizedTab, options.replaceUrl);
    }
  }

  function showServerApp() {
    setHidden(serverBotMissing, true);
    setHidden(serverApp, false);
  }

  function showBotMissing() {
    setHidden(serverApp, true);
    setHidden(serverBotMissing, false);

    profileRoot.classList.remove("loading");
    statsRoot.classList.remove("loading");
  }

  function syncChartUi(type) {
    const normalizedType = normalizeChartType(type);

    chartModal.dataset.chartType = normalizedType;
    setText(chartTitleEl, chartTitle(normalizedType));


    for (const tab of chartTabs) {
      const isActive = normalizeChartType(tab.dataset.chartType) === normalizedType;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.setAttribute("tabindex", isActive ? "0" : "-1");
    }
  }

  function renderOptions(type = "guild_messages") {
    const roles = Ids.roles ?? {};
    let channels = {};

    if (type === "guild_voice") {
      channels = Ids.channels?.voice_channels ?? {};
    } else {
      channels = Ids.channels?.message_channels ?? {};
    }

    chartChannelId.innerHTML = "";
    chartRoleId.innerHTML = "";

    const defaultChannelOption = document.createElement("option");
    defaultChannelOption.value = "";
    defaultChannelOption.selected = true;
    defaultChannelOption.textContent = t("chart.preset.channel");
    chartChannelId.appendChild(defaultChannelOption);

    const defaultRoleOption = defaultChannelOption.cloneNode(true);
    defaultRoleOption.textContent = t("chart.preset.role");
    chartRoleId.appendChild(defaultRoleOption);

    for (const [channelId, channelProps] of Object.entries(channels)) {
      const option = document.createElement("option");
      option.value = channelId;
      option.textContent = channelProps?.name ?? channelId;
      chartChannelId.appendChild(option);
    }

    for (const [roleId, roleProps] of Object.entries(roles)) {
      const option = document.createElement("option");
      option.value = roleId;
      option.textContent = roleProps?.name ?? roleId;
      chartRoleId.appendChild(option);
    }

    chartChannelId.disabled = false;
  }

  function renderStats(res) {
    lastProfileResponse = res ?? null;

    setText(statMessages, formatNumber(res?.messages));
    setText(statVoice, res?.voice_time ?? "00:00");
    setText(statActivities, res?.activity_seconds ?? "00:00");

    setText(statMoneyTotal, formatMoney(res?.total_balance));
    setText(statMoneyBank, formatMoney(res?.bank_balance));
    setText(statMoneyCash, formatMoney(res?.balance));

    setText(statMembers, formatNumber(res?.members));

    setText(profileXpLine, t("profile.xp_line", {
      now: formatNumber(res?.xp_now),
      need: formatNumber(res?.xp_need),
      total: formatNumber(res?.xp)
    }));

    setText(profileLevel, t("profile.level", { level: formatNumber(res?.lvl) }));

    if (profileXpBar) {
      const now = Number(res?.xp_now ?? 0);
      const need = Number(res?.xp_need ?? 0);
      const pct = need > 0 ? (now / need) * 100 : 0;
      const safePct = Math.min(100, Math.max(0, pct));

      profileXpBar.style.width = `${safePct}%`;
      profileXpBarContainer.ariaValueNow = Math.round(safePct);
    }

    setText(profileName, res?.name ?? t("servers.unknown"));

    if (profilePfp && res?.icon) {
      profilePfp.src = res.icon;
    }

    renderBadgeRow(profileBadges, res?.badges);

    profileRoot.classList.remove("loading");
    statsRoot.classList.remove("loading");
  }

  async function loadStats() {
    const lastKey = `wolium:last_server_stats:${guildId}`;

    if (!guildId) {
      console.warn("No guild_id provided, returning back.");
      window.history.back();
      return null;
    }

    setHidden($("#membersTab"), false);

    try {
      const res = await wr.queue("guild_profile_stats", { guild_id: guildId }, {
        cacheTtlMs: 30_000,
        cooldownMs: 1_500,
        timeoutMs: 5_000
      });

      if (res?.me === false) {
        lsJSONSet(lastKey, { t: Date.now(), res });
        showBotMissing();
        return res;
      }

      showServerApp();

      lsCleanExpired("wolium:last_server_stats:", 1000 * 60 * 60 * 24 * 7);
      lsJSONSet(lastKey, { t: Date.now(), res });

      renderStats(res);

      if (res?.error) {
        console.error("[server] stats load error:", res?.error);
        hud.error(res?.error, { title: t("server.stats_load_error") });
      }

      Ids.channels = res?.channels ?? {};
      Ids.roles = res?.roles ?? {};
      renderOptions(normalizeChartType(chartModal?.dataset?.chartType || "guild_messages"));

      return res;
    } catch (e) {
      const saved = lsJSONGet(lastKey, null);

      if (saved?.res?.me === false) {
        showBotMissing();
        return saved.res;
      }

      if (saved?.res) {
        showServerApp();
        renderStats(saved.res);
        Ids.channels = saved.res?.channels ?? {};
        Ids.roles = saved.res?.roles ?? {};
        renderOptions(normalizeChartType(chartModal?.dataset?.chartType || "guild_messages"));
        return saved.res;
      }

      throw e;
    }
  }

  function ensureChart() {
    if (chart) return chart;

    chart = initChart(queueChart, {
      guildId,
      cacheTtlMs: 30_000,
      cooldownMs: 1_500,
      timeoutMs: 80_000,
      defaultDays: 30,
      viewer: {
        name: profileName?.textContent || t("common.user"),
        avatar: profilePfp?.src || null
      },
      onTypeChange: syncChartUi
    });

    return chart;
  }

  function openChart(type) {
    const normalizedType = normalizeChartType(type);

    syncChartUi(normalizedType);
    renderOptions(normalizedType);
    chartChannelId.value = "";
    setModalOpen(chartModal, true);

    const c = ensureChart();
    c?.setType(normalizedType);
  }

  function closeChart() {
    setModalOpen(chartModal, false);
  }

  setActiveTab(readServerTab());

  for (const button of serverTabs) {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.serverTab, { updateUrl: true });
    });
  }

  window.addEventListener("popstate", () => {
    setActiveTab(readServerTab());
  });

  document.querySelectorAll("[data-chart-type]").forEach((el) => {
    on(el, "click", (e) => {
      e.stopPropagation();
      setTimeout(() => {
        renderOptions(normalizeChartType(chartModal?.dataset?.chartType || "guild_messages"));
      }, 0);
    });
  });

  try {
    await loadStats();
  } catch (e) {
    console.warn("[server] init failed:", e);
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

  syncChartUi("guild_messages");

  onLangChange(() => {
    const currentType = chartModal?.dataset?.chartType || "guild_messages";

    if (chartModal?.classList.contains("is-open")) {
      syncChartUi(currentType);
      renderOptions(currentType);
    } else {
      setText(chartTitleEl, t("chart.title"));
    }

    if (lastProfileResponse && lastProfileResponse?.me !== false) {
      renderBadgeRow(profileBadges, lastProfileResponse?.badges);
      renderStats(lastProfileResponse);
    }
  });

  return chart;
}