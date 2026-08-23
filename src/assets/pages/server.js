import { $, lsJSONGet, lsJSONSet, lsCleanExpired, t, onLangChange, hud, on, initCollapsible } from "@/lib/index.js";
import { createWebRequestService } from "@/services/index.js";
import { initChart } from "@/lib/chart/chart.js";
import { getDiscordProviderToken, logout } from "@/lib/auth/discordProviderToken.js";
import { buildServerSettingsForm, collectFormPayload } from "@/lib/server/settingsForm.js";
import { applyServerAnalyticsData } from "@/lib/server/serverAnalytics.js";

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
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
}

export async function initServerPage(sb) {
  const serverApp = $("#serverApp");
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

  const serverSettingsSections = $("#serverSettingsSections");
  const serverSettingsForm = $("#serverSettingsForm");
  const serverSettingsCard = $("#serverSettings");

  const guildId = getParam("guild_id") || "";
  const administrator = getParam("administrator") === "true";

  await sb.auth.getSession();

  let discordToken = null;
  try {
    discordToken = await getDiscordProviderToken(sb);
  } catch (error) {
    hud.error(error);
    return logout(error);
  }

  const Ids = { channels: {}, roles: {} };

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
  let currentServerConfig = null;
  let isConfigLoaded = false;

  function buildServerSettingsDOM(configData) {
    if (!serverSettingsSections) return;
    buildServerSettingsForm(serverSettingsSections, configData, Ids.channels, t);
    serverSettingsCard?.classList.remove("loading");
    initCollapsible(serverSettingsSections, ["ttl", "ai"]);
  }

  serverSettingsForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = collectFormPayload(serverSettingsSections, serverSettingsForm);
    payload.guild_id = guildId;
    payload.discord_token = discordToken;

    try {
      const res = await wr.queue("save_guild_config", payload, {
        cacheTtlMs: 0, cooldownMs: 1_000, timeoutMs: 7_000
      });

      if (res && !res.error) {
        hud.success(t("settings.privacy_saved"));
        currentServerConfig = { ...currentServerConfig, ...payload };
      } else {
        throw new Error(res?.error || "Save error");
      }
    } catch (e) {
      console.error("[server] Failed to save settings:", e);
      hud.error(t("settings.privacy_save_error"));
    }
  });

  async function loadServerConfig() {
    if (isConfigLoaded || !administrator) return;

    serverSettingsCard?.classList.add("loading");

    try {
      const res = await wr.queue("get_guild_config", { guild_id: guildId, discord_token: discordToken }, {
        cacheTtlMs: 15_000, cooldownMs: 1_000, timeoutMs: 5_000
      });

      if (res && !res.error) {
        currentServerConfig = res;
        isConfigLoaded = true;
        buildServerSettingsDOM(currentServerConfig);
      } else {
        throw new Error(res?.error || "Load error");
      }
    } catch (e) {
      console.error("[server] Settings didnt loaded:", e);
      hud.error(t("settings.privacy_load_error"));
    }
  }

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

    if (options.updateUrl) writeServerTab(normalizedTab, options.replaceUrl);
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
    let channels = type === "guild_voice" ? (Ids.channels?.voice_channels ?? {}) : (Ids.channels?.message_channels ?? {});

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
    applyServerAnalyticsData(document, res, t, hasSpriteSymbol);
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
        cacheTtlMs: 30_000, cooldownMs: 1_500, timeoutMs: 5_000
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

      if (administrator) {
        loadServerConfig();
        document.querySelector('[data-server-tab="settings"]').disabled = !administrator;
      }

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
        if (administrator) {
          loadServerConfig();
          document.querySelector('[data-server-tab="settings"]').disabled = !administrator;
        }
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
      viewer: { name: t("common.user"), avatar: null },
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
    button.addEventListener("click", () => setActiveTab(button.dataset.serverTab, { updateUrl: true }));
  }

  window.addEventListener("popstate", () => setActiveTab(readServerTab()));

  document.querySelectorAll("[data-chart-type]").forEach((el) => {
    on(el, "click", (e) => {
      e.stopPropagation();
      setTimeout(() => renderOptions(normalizeChartType(chartModal?.dataset?.chartType || "guild_messages")), 0);
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
      renderStats(lastProfileResponse);
    }
  });

  return chart;
}