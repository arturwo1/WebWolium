import { $, lsJSONGet, lsJSONSet, lsCleanExpired, t, onLangChange, hud, createModalController, getParam, setParam } from "@/lib/index.js";
import { createWebRequestService } from "@/services/index.js";
import { initChart } from "@/lib/chart/chart.js";
import { createEntityResolver } from "@/lib/discord/entities.js";
import { setEntityResolver } from "@/lib/discord/entityService.js";
import { createUserFetcher } from "@/lib/discord/fetchers.js";
import { CHART_PARAM_KEYS, collectChartParams, readChartParams, applyChartParams, snapshotChartSelects, restoreChartSelects } from "@/lib/chart/chartUrlState.js";
import { getDiscordProviderToken, logout } from "@/lib/auth/discordProviderToken.js";
import { mountSettings } from "@/lib/server/settings/settingsView.js";
import { settingsRegistry } from "@/lib/server/settings/registry/index.js";
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

function readServerTab() {
  return normalizeServerTab(getParam("tab"));
}

function writeServerTab(tab, replace = false) {
  const nextTab = normalizeServerTab(tab);
  setParam("tab", nextTab, { replace, drop: nextTab === "settings" ? [] : ["s"] });
}

export async function initServerPage(sb) {
  const serverApp = $("#serverApp");
  const profileRoot = $("#profileCard");
  const statsRoot = $("#profileStats");

  const serverBotMissing = $("#serverBotMissing");
  const serverTabs = Array.from(document.querySelectorAll("[data-server-tab]"));
  const serverViews = Array.from(document.querySelectorAll("[data-server-view]"));

  const chartModal = $("#appModal");
  const chartTabs = Array.from(document.querySelectorAll("[data-chart-type]"));
  const chartChannelId = $("#chartChannelId");
  const chartRoleId = $("#chartRoleId");

  const serverSettingsRoot = $("#serverSettingsRoot");
  const serverSettingsCard = $("#serverSettings");

  const guildId = getParam("guild_id") || "";
  const administrator = getParam("administrator") === "true";

  await sb.auth.getSession();

  let discordToken = null;
  try {
    discordToken = await getDiscordProviderToken(sb, { forceRefresh: false });
  } catch (error) {
    hud.error(error);
    return logout(error);
  }

  const Ids = { channels: {}, roles: {} };

  if (!serverApp || !serverBotMissing || !statsRoot || !profileRoot || !chartModal || !chartChannelId || !guildId) {
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

  const entityWr = createWebRequestService(sb, {
    defaultCacheTtlMs: 0,
    defaultCooldownMs: 0,
    defaultTimeoutMs: 8_000,
    hud: { loading: () => () => { }, error: () => { } }
  });

  setEntityResolver(createEntityResolver({
    fetchers: { user: createUserFetcher((kind, payload, opts) => entityWr.queue(kind, payload, opts)) },
    storage: { get: lsJSONGet, set: lsJSONSet }
  }));

  const queueChart = wr.makeLatestDebouncedQueue({
    debounceMs: 200,
    kinds: new Set(["guild_messages_series", "guild_voice_series", "guild_activities_series", "guild_members_series"]),
  });

  let lastProfileResponse = null;
  let chart = null;
  let modalCtl = null;
  let currentServerConfig = null;
  let isConfigLoaded = false;

  let settingsController = null;
  const searchPanel = chartModal.querySelector('[data-modal-panel="settingsSearch"]');

  function buildServerSettingsDOM(configData) {
    if (!serverSettingsRoot) return;
    settingsController?.destroy();
    settingsController = mountSettings(serverSettingsRoot, {
      registry: settingsRegistry,
      values: { guild_config: configData, guild_settings_bunker: configData.guild_settings_bunker },
      channels: Ids.channels,
      roles: Ids.roles,
      translate: t,
      search: searchPanel && modalCtl ? { controller: modalCtl, tabId: "settingsSearch", panel: searchPanel } : null,
      onSave: saveServerSettings
    });
    serverSettingsCard?.classList.remove("loading");
  }

  async function saveServerSettings(changes) {
    const payload = { ...changes.guild_config, guild_id: guildId, discord_token: discordToken };
    if (changes.guild_settings_bunker) payload.guild_settings_bunker = changes.guild_settings_bunker;

    try {
      const res = await wr.queue("save_guild_config", payload, {
        cacheTtlMs: 0, cooldownMs: 1_000, timeoutMs: 7_000
      });

      if (!res || res.error) throw new Error(res?.error || "Save error");

      hud.success(t("settings.privacy_saved"));
      currentServerConfig = {
        ...currentServerConfig,
        ...changes.guild_config,
        guild_settings_bunker: { ...currentServerConfig.guild_settings_bunker, ...changes.guild_settings_bunker }
      };
    } catch (e) {
      console.error("[server] Failed to save settings:", e);
      hud.error(t("settings.privacy_save_error"));
      throw e;
    }
  }

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

  function currentChartType() {
    return normalizeChartType(modalCtl?.current()?.chartType || "guild_messages");
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
      renderOptions(currentChartType());

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
        renderOptions(currentChartType());
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
      viewer: { name: t("common.user"), avatar: null }
    });

    return chart;
  }

  modalCtl = createModalController(chartModal, {
    extraKeys: CHART_PARAM_KEYS,
    getParams: () => (modalCtl.current()?.panel === "chart" ? collectChartParams(chartModal) : {}),
    onOpen: (tab, info) => {
      if (tab.panel !== "chart") return;
      const type = normalizeChartType(tab.chartType);
      const kept = snapshotChartSelects(chartModal);
      renderOptions(type);
      restoreChartSelects(chartModal, kept);
      const params = info?.fromUrl ? readChartParams(new URLSearchParams(window.location.search)) : null;
      const applyParams = (notify) => applyChartParams(chartModal, params, { notify });
      if (params) applyParams(false);
      ensureChart()?.setType(type);
      if (params) applyParams(true);
    },
    onTab: (tab) => {
      if (tab.panel !== "chart") return;
      const type = normalizeChartType(tab.chartType);
      const kept = snapshotChartSelects(chartModal);
      ensureChart()?.setType(type);
      renderOptions(type);
      restoreChartSelects(chartModal, kept);
    }
  });

  setActiveTab(readServerTab());

  for (const button of serverTabs) {
    button.addEventListener("click", () => setActiveTab(button.dataset.serverTab, { updateUrl: true }));
  }

  window.addEventListener("popstate", () => setActiveTab(readServerTab()));

  try {
    const stats = await loadStats();
    if (stats && stats.me !== false) modalCtl.syncFromUrl();
  } catch (e) {
    console.warn("[server] init failed:", e);
  }

  statsRoot.addEventListener("click", (e) => {
    const btn = e.target.closest(".stat--link");
    const type = btn?.dataset?.chart;
    if (!type) return;
    modalCtl.open(type);
  });

  onLangChange(() => {
    if (modalCtl.isOpen() && modalCtl.current()?.panel === "chart") {
      const kept = snapshotChartSelects(chartModal);
      renderOptions(currentChartType());
      restoreChartSelects(chartModal, kept);
    }

    if (lastProfileResponse && lastProfileResponse?.me !== false) {
      renderStats(lastProfileResponse);
    }
  });

  return chart;
}