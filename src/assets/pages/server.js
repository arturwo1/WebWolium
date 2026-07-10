import { $, lsJSONGet, lsJSONSet, lsCleanExpired, escapeHtml, t, onLangChange, hud, formatNumber, on, initCollapsible } from "@/lib/index.js";
import { createWebRequestService } from "@/services/index.js";
import { initChart } from "@/lib/chart/chart.js";
import { getDiscordProviderToken, logout } from "@/lib/auth/discordProviderToken.js"

const SERVER_TABS = new Set(["analytics", "settings"]);

const SECTION_ORDER = ["log_channels", "auto_moderation", "ai", "games", "notifications", "ttl"];

const SECTION_LABELS = {
  "log_channels": "server.section_log_channels",
  "auto_moderation": "server.section_auto_moderation",
  "ai": "server.section_ai",
  "games": "server.section_games",
  "notifications": "server.section_notifications",
  "ttl": "server.section_ttl",
};

const FLAGS_OPTIONS = {
  "normal": "server.option_normal",
  "ai": "server.option_ai",
  "extreme": "server.option_extreme",
}

const CONFIG_SCHEMA = {
  mod_log_channel: { type: "channel", channelType: "message_channels", label: "server.flag_mod_log_channel", tooltip: "server.tooltip_mod_log_channel" },

  moderation: { type: "boolean", label: "server.flag_moderation", tooltip: "server.tooltip_moderation" },
  moderation_type: { type: "select", label: "server.flag_moderation_type", tooltip: "server.tooltip_moderation_type", options: [{ v: "normal", t: FLAGS_OPTIONS.normal }, { v: "ai", t: FLAGS_OPTIONS.ai }] },
  rules: { type: "textarea", label: "server.flag_rules", tooltip: "server.tooltip_rules" },

  aibot: { type: "boolean", label: "server.flag_aibot", tooltip: "server.tooltip_aibot" },
  ai_message_delete: { type: "boolean", label: "server.flag_ai_message_delete", tooltip: "server.tooltip_ai_message_delete" },
  ai_message_ttl: { type: "number", label: "server.flag_ai_message_ttl", tooltip: "server.tooltip_ai_message_ttl" },
  ai_long_message_ttl: { type: "number", label: "server.flag_ai_long_message_ttl", tooltip: "server.tooltip_ai_long_message_ttl" },

  word_channel: { type: "channel", channelType: "message_channels", label: "server.flag_word_channel", tooltip: "server.tooltip_word_channel" },
  words: { type: "json_array", label: "server.flag_words", tooltip: "server.tooltip_words" },
  filter: { type: "select", label: "server.flag_filter", tooltip: "server.tooltip_filter", options: [{ v: "normal", t: FLAGS_OPTIONS.normal }, { v: "extreme", t: FLAGS_OPTIONS.extreme }] },
  number_channel: { type: "channel", channelType: "message_channels", label: "server.flag_number_channel", tooltip: "server.tooltip_number_channel" },

  news: { type: "boolean", label: "server.flag_news", tooltip: "server.tooltip_news" },
  news_channel: { type: "channel", channelType: "message_channels", label: "server.flag_news_channel", tooltip: "server.tooltip_news_channel" },
  important: { type: "boolean", label: "server.flag_important", tooltip: "server.tooltip_important" },
  important_channel: { type: "channel", channelType: "message_channels", label: "server.flag_important_channel", tooltip: "server.tooltip_important_channel" },
  critical: { type: "boolean", label: "server.flag_critical", disabled: true, forcedValue: true, tooltip: "server.tooltip_critical" },
  critical_channel: { type: "channel", channelType: "message_channels", label: "server.flag_critical_channel", tooltip: "server.tooltip_critical_channel" },

  ttl_channel: { type: "ttl_map", label: "server.flag_ttl_channel", tooltip: "server.tooltip_ttl_channel" },
};

const SECTION_FLAGS = {
  "log_channels": ["mod_log_channel"],
  "auto_moderation": ["moderation", "moderation_type", "rules"],
  "ai": ["aibot", "ai_message_delete", "ai_message_ttl", "ai_long_message_ttl"],
  "games": ["word_channel", "words", "filter", "number_channel"],
  "notifications": ["news", "news_channel", "important", "important_channel", "critical", "critical_channel"],
  "ttl": ["ttl_channel"],
};

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
      <div class="badge" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">
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

  const serverSettingsSections = $("#serverSettingsSections");
  const serverSettingsForm = $("#serverSettingsForm");
  const serverSettingsCard = $("#serverSettings");

  const guildId = getParam("guild_id") || "";
  const administrator = getParam("administrator") === "true";

  const { data: sessionData } = await sb.auth.getSession();

  let discordToken = null;
  try {
    discordToken = await getDiscordProviderToken(sb);
  } catch (error) {
    hud.error(error);
    return logout(error);
  }

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

  let currentServerConfig = null;
  let isConfigLoaded = false;

  function parseTtlMap(val) {
    if (!val) return {};
    if (typeof val === "object" && !Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return {}; }
  }

  const TTL_RE = /^(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s\s*)?$/;

  function validateTtl(str) {
    const s = str.trim();
    if (!s) return { ok: false, msg: t("server.ttl_empty") };
    if (!TTL_RE.test(s)) return { ok: false, msg: t("server.ttl_invalid") };
    const [, d, h, m, sec] = s.match(TTL_RE).map(Number);
    const totalSec = (d || 0) * 86400 + (h || 0) * 3600 + (m || 0) * 60 + (sec || 0);
    if (totalSec === 0) return { ok: false, msg: t("server.ttl_zero") };
    if (totalSec > 365 * 86400) return { ok: false, msg: t("server.ttl_too_long") };
    return { ok: true };
  }

  function createTtlEditor(key, currentChannels) {
    const ttlMap = parseTtlMap(currentServerConfig[key] || "{}");

    const root = document.createElement("div");
    root.className = "ttl-editor";

    const list = document.createElement("div");
    list.className = "ttl-list";

    function renderList() {
      list.innerHTML = "";
      const entries = Object.entries(ttlMap);

      if (!entries.length) {
        const empty = document.createElement("div");
        empty.className = "ttl-empty";
        empty.setAttribute("data-i18n", "server.ttl_no_channels");
        empty.textContent = t("server.ttl_no_channels");
        list.appendChild(empty);
        return;
      }

      entries.forEach(([chId, ttlStr]) => {
        const chName = currentChannels[chId]?.name || chId;

        const row = document.createElement("div");
        row.className = "ttl-row";

        const nameEl = document.createElement("span");
        nameEl.className = "ttl-row__name";
        nameEl.textContent = `#${chName}`;

        const input = document.createElement("input");
        input.type = "text";
        input.className = "input ttl-row__input";
        input.value = ttlStr;
        input.placeholder = "e.g. 1d 2h";
        input.name = `ttl__${chId}`;

        const errEl = document.createElement("span");
        errEl.className = "ttl-row__err";
        errEl.hidden = true;

        input.addEventListener("input", () => {
          const { ok, msg } = validateTtl(input.value);
          errEl.hidden = ok;
          errEl.textContent = msg || "";
          if (ok) {
            ttlMap[chId] = input.value.trim();
          }
        });

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "ttl-row__remove";
        removeBtn.title = t("remove");
        removeBtn.innerHTML = `
          <svg class="icon">
            <use href="#close"></use>
          </svg>
        `;
        removeBtn.addEventListener("click", () => {
          delete ttlMap[chId];
          renderList();
        });

        row.appendChild(nameEl);
        row.appendChild(input);
        row.appendChild(errEl);
        row.appendChild(removeBtn);
        list.appendChild(row);
      });
    }

    renderList();

    const addRow = document.createElement("div");
    addRow.className = "ttl-add-row";

    const channelSelect = document.createElement("select");
    channelSelect.className = "input ttl-add__select";

    const defOpt = document.createElement("option");
    defOpt.value = "";
    defOpt.textContent = t("chart.preset.channel");
    channelSelect.appendChild(defOpt);

    Object.entries(currentChannels).forEach(([chId, chProps]) => {
      if (ttlMap[chId] !== undefined) return;
      const opt = document.createElement("option");
      opt.value = chId;
      opt.textContent = `#${chProps?.name || chId}`;
      channelSelect.appendChild(opt);
    });

    const ttlInput = document.createElement("input");
    ttlInput.type = "text";
    ttlInput.className = "input ttl-add__value";
    ttlInput.placeholder = "1d 2h 30m";

    const addErrEl = document.createElement("span");
    addErrEl.className = "ttl-row__err";
    addErrEl.hidden = true;

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn-preset ttl-add__btn";
    addBtn.setAttribute("data-i18n", "server.ttl_add");
    addBtn.textContent = t("server.ttl_add");

    addBtn.addEventListener("click", () => {
      const chId = channelSelect.value;
      const ttlStr = ttlInput.value.trim();

      if (!chId) {
        addErrEl.textContent = t("server.ttl_pick_channel_err");
        addErrEl.hidden = false;
        return;
      }

      const { ok, msg } = validateTtl(ttlStr);
      if (!ok) {
        addErrEl.textContent = msg;
        addErrEl.hidden = false;
        return;
      }

      addErrEl.hidden = true;
      ttlMap[chId] = ttlStr;

      const addedOpt = channelSelect.querySelector(`option[value="${chId}"]`);
      addedOpt?.remove();
      channelSelect.value = "";
      ttlInput.value = "";

      renderList();
    });

    const origRenderList = renderList;
    function renderListAndSync() {
      origRenderList();

      [...channelSelect.options].forEach(opt => {
        if (opt.value && ttlMap[opt.value] !== undefined) opt.remove();
      });

      Object.entries(currentChannels).forEach(([chId, chProps]) => {
        if (ttlMap[chId] !== undefined) return;
        if (channelSelect.querySelector(`option[value="${chId}"]`)) return;
        const opt = document.createElement("option");
        opt.value = chId;
        opt.textContent = `#${chProps?.name || chId}`;
        channelSelect.appendChild(opt);
      });
    }

    list._rerender = renderListAndSync;

    removeBtn_patch: {
      list.addEventListener("click", e => {
        const btn = e.target.closest(".ttl-row__remove");
        if (!btn) return;
        const row = btn.closest(".ttl-row");
        const input = row?.querySelector(".ttl-row__input");
        if (!input) return;
        const chId = input.name.replace("ttl__", "");
        delete ttlMap[chId];
        renderListAndSync();
      });
    }

    addRow.appendChild(channelSelect);
    addRow.appendChild(ttlInput);
    addRow.appendChild(addBtn);
    addRow.appendChild(addErrEl);

    root.appendChild(list);
    root.appendChild(addRow);

    root._getTtlValue = () => JSON.stringify(ttlMap);

    return root;
  }

  function createInputField(key, schema, val, labelText = "") {
    if (schema.type === "boolean") {
      const wrapper = document.createElement("label");
      wrapper.className = "input";
      wrapper.style.cursor = schema.disabled ? "not-allowed" : "pointer";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = key;
      checkbox.checked = schema.forcedValue !== undefined ? schema.forcedValue : Boolean(val);

      if (schema.disabled) {
        checkbox.disabled = true;
      }

      wrapper.appendChild(checkbox);

      if (labelText) {
        const textSpan = document.createElement("span");
        textSpan.setAttribute("data-i18n", schema.label);
        textSpan.textContent = labelText;
        wrapper.appendChild(textSpan);

        if (schema.tooltip) {
          const infoIcon = document.createElement("span");
          infoIcon.style.cursor = "help";
          infoIcon.title = t(schema.tooltip);
          infoIcon.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#info"></use></svg>`;
          wrapper.appendChild(infoIcon);
        }
      }

      return wrapper;
    }

    if (schema.type === "select") {
      const select = document.createElement("select");
      select.className = "input";
      select.name = key;
      schema.options.forEach(opt => {
        const option = document.createElement("option");
        option.value = opt.v;
        option.textContent = t(opt.t);
        if (opt.v === val) option.selected = true;
        select.appendChild(option);
      });
      return select;
    }

    if (schema.type === "channel") {
      const select = document.createElement("select");
      select.className = "input";
      select.name = key;

      const defOpt = document.createElement("option");
      defOpt.value = "";
      defOpt.textContent = t("chart.preset.channel");
      select.appendChild(defOpt);

      const channels = Ids.channels?.[schema.channelType] || {};
      for (const [chId, chProps] of Object.entries(channels)) {
        const option = document.createElement("option");
        option.value = chId;
        option.textContent = chProps?.name || chId;
        if (chId === String(val)) option.selected = true;
        select.appendChild(option);
      }
      return select;
    }

    if (schema.type === "textarea") {
      const textarea = document.createElement("textarea");
      textarea.className = "input";
      textarea.name = key;
      textarea.style.minHeight = "120px";
      textarea.value = String(val ?? "");
      return textarea;
    }

    const input = document.createElement("input");
    input.className = "input";
    input.name = key;

    if (schema.type === "number") {
      input.type = "number";
      input.min = "0";
      input.placeholder = "0";
      input.value = val !== undefined && val !== null ? String(val) : "";
    }

    if (schema.type === "json_array") {
      input.type = "text";
      try {
        const parsed = typeof val === "string" ? JSON.parse(val) : val;
        input.value = Array.isArray(parsed) ? parsed.join(", ") : "";
      } catch { input.value = String(val ?? ""); }
    }

    if (schema.type === "ttl_map") {
      const channels = Ids.channels?.message_channels ?? {};
      return createTtlEditor(key, channels);
    }

    return input;
  }

  function buildServerSettingsDOM(configData) {
    if (!serverSettingsSections) return;
    serverSettingsSections.innerHTML = "";

    for (const sectionKey of SECTION_ORDER) {
      const flags = SECTION_FLAGS[sectionKey];
      if (!flags || !flags.length) continue;

      const sectionEl = $("#serverSectionTemplate").content.cloneNode(true);
      const sectionDiv = sectionEl.querySelector(".privacy-section");
      sectionDiv.dataset.sectionKey = sectionKey;

      const title = sectionEl.querySelector(".privacy-section__title");
      title.setAttribute("data-i18n", SECTION_LABELS[sectionKey]);
      title.textContent = t(SECTION_LABELS[sectionKey]);

      const flagsContainer = sectionEl.querySelector(".privacy-flags");

      for (const flagKey of flags) {
        const schema = CONFIG_SCHEMA[flagKey];
        if (!schema) continue;

        const flagEl = $("#serverFlagTemplate").content.cloneNode(true);
        const label = flagEl.querySelector(".server-control-label");
        const fieldContainer = flagEl.querySelector(".server-control-field");

        label.className = "input";

        if (schema.type === "boolean") {
          label.remove();
          const inputField = createInputField(flagKey, schema, configData[flagKey], t(schema.label));
          fieldContainer.appendChild(inputField);
        } else {
          label.textContent = "";

          const labelTextSpan = document.createElement("span");
          labelTextSpan.setAttribute("data-i18n", schema.label);
          labelTextSpan.textContent = t(schema.label);
          label.appendChild(labelTextSpan);

          if (schema.tooltip) {
            const infoIcon = document.createElement("span");
            infoIcon.style.cursor = "help";
            infoIcon.style.fontSize = "initial";
            infoIcon.style.fontWeight = "initial";
            infoIcon.title = t(schema.tooltip);
            infoIcon.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#info"></use></svg>`;
            label.appendChild(infoIcon);
          }

          const inputField = createInputField(flagKey, schema, configData[flagKey]);
          fieldContainer.appendChild(inputField);
        }

        flagsContainer.appendChild(flagEl);
      }

      serverSettingsSections.appendChild(sectionEl);
    }

    serverSettingsCard?.classList.remove("loading");

    initCollapsible(serverSettingsSections, ["ttl", "ai"]);
  }

  serverSettingsForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(serverSettingsForm);
    const payload = { guild_id: guildId, discord_token: discordToken };

    for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
      if (schema.forcedValue !== undefined) {
        payload[key] = schema.forcedValue;
        continue;
      }

      if (schema.type === "boolean") {
        payload[key] = formData.has(key);
      } else if (schema.type === "number") {
        const rawNum = formData.get(key);
        const parsedNum = parseInt(rawNum, 10);
        payload[key] = isNaN(parsedNum) || parsedNum <= 0 ? 0 : parsedNum;
      } else if (schema.type === "json_array") {
        const rawValue = formData.get(key) || "";
        const arr = rawValue.split(",").map(s => s.trim()).filter(Boolean);
        payload[key] = JSON.stringify(arr);
      } else if (schema.type === "ttl_map") {
        const ttlEditor = serverSettingsSections.querySelector(".ttl-editor");
        payload[key] = ttlEditor?._getTtlValue?.() ?? "{}";
        continue;
      } else {
        payload[key] = formData.get(key) || null;
      }
    }

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