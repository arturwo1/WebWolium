import {
  $,
  lsJSONGet,
  lsJSONSet,
  lsCleanExpired,
  readIdentity
} from "@/lib/index.js";

import { createWebRequestService } from "@/services/index.js";
import { initProfileChart } from "./profile_chart.js";
import { t, onLangChange } from "@/lib/text/i18n.js";
import { hud } from "@/lib/index.js";

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

function normalizeChartType(type) {
  if (type === "voice") return "voice";
  if (type === "activities") return "activities";
  if (type === "commands") return "commands";
  return "messages";
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
  if (type === "messages") return t("profile.messages");
  if (type === "voice") return t("profile.voice");
  if (type === "activities") return t("profile.activities");
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

function getParam(key) {
  const params = new URLSearchParams(window.location.search);
  return (params.get(key) || "").trim();
}

export async function initProfilePage(sb) {
  const statMessages = $("#statMessages");
  const statVoice = $("#statVoice");
  const statActivities = $("#statActivities");
  const statMoneyTotal = $("#statMoneyTotal");
  const statMoneyBank = $("#statMoneyBank");
  const statMoneyCash = $("#statMoneyCash");
  const statCommands = $("#statCommands");
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

  const profileRoot = $("#profileCard");
  const statsRoot = $("#profileStats");
  const chartModal = $("#chartModal");
  const chartClose = $("#chartClose");
  const chartTitleEl = $("#chartTitle");
  const chartTabs = Array.from(document.querySelectorAll("[data-chart-type]"));

  const chartGuildId = $("#chartGuildId");
  const chartChannelId = $("#chartChannelId");

  const userDiscordId = getParam("user_id") || "";

  const Ids = {
    guilds: {}
  };

  if (!statsRoot || !chartModal || !chartClose || !chartTitleEl || !chartGuildId || !chartChannelId) {
    return null;
  }

  const wr = createWebRequestService(sb, {
    defaultCacheTtlMs: 30_000,
    defaultCooldownMs: 1_500,
    defaultTimeoutMs: 15_000
  });

  const queueChart = wr.makeLatestDebouncedQueue({
    debounceMs: 200,
    kinds: new Set(["messages_series", "voice_series", "activities_series", "commands_series"]),
  });

  let lastProfileResponse = null;
  let chart = null;

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

  function renderChannelOptions(guildId = "", type = "") {
    let channels = {};
    if (type == "voice") {
      channels = Ids.guilds?.[guildId]?.voice_channels;
    } else {
      channels = Ids.guilds?.[guildId]?.text_channels;
    }

    chartChannelId.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.selected = true;

    if (!channels || !Object.keys(channels).length) {
      defaultOption.disabled = true;
      defaultOption.textContent = t("chart.preset.channel.locked");
      chartChannelId.appendChild(defaultOption);
      chartChannelId.disabled = true;
      return;
    }

    defaultOption.textContent = t("chart.preset.channel");
    chartChannelId.appendChild(defaultOption);

    for (const [channelId, channelProps] of Object.entries(channels)) {
      const option = document.createElement("option");
      option.value = channelId;
      option.textContent = channelProps?.name ?? channelId;
      chartChannelId.appendChild(option);
    }

    chartChannelId.disabled = false;
  }

  function renderGuildOptions(type="") {
    const currentValue = chartGuildId.value;

    chartGuildId.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = t("chart.preset.guild");
    chartGuildId.appendChild(defaultOption);

    for (const [guildId, guildProps] of Object.entries(Ids.guilds || {})) {
      const option = document.createElement("option");
      option.value = guildId;
      option.textContent = guildProps?.name ?? guildId;
      chartGuildId.appendChild(option);
    }

    if (currentValue && Ids.guilds?.[currentValue]) {
      chartGuildId.value = currentValue;
    }

    renderChannelOptions(chartGuildId.value, type);
  }

  async function fillIdentity() {
    if (userDiscordId) return;
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
    } catch {}
  }

  function renderStats(res) {
    lastProfileResponse = res ?? null;

    setText(statMessages, res?.messages ?? 0);
    setText(statVoice, res?.voice_time ?? "00:00");
    setText(statActivities, res?.activity_seconds ?? "00:00");

    setText(statMoneyTotal, formatMoneyEUR(res?.total_balance ?? 0));
    setText(statMoneyBank, formatMoneyEUR(res?.bank_balance ?? 0));
    setText(statMoneyCash, formatMoneyEUR(res?.balance ?? 0));

    setText(statCommands, res?.user_commands ?? 0);

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

    profileRoot.classList.remove("loading");
    statsRoot.classList.remove("loading");

    if (userDiscordId) {
      document.querySelectorAll('.stat.stat--link').forEach(btn => {
        const div = document.createElement('div');
        div.className = btn.className.replace('stat--link', '');
        div.innerHTML = btn.innerHTML;
        btn.replaceWith(div);
      });
      setText(profileTag, res?.display_name ?? t("profile.unknown_name"));
    }
  }

  async function loadStats() {
    const { data } = await sb.auth.getSession();
    const userId = data?.session?.user?.id || userDiscordId || "anon";
    const lastKey = `wolium:last_profile_stats:${userId}`;

    try {
      const res = await wr.queue("profile_stats", {"user_id": userDiscordId}, {
        cacheTtlMs: 30_000,
        cooldownMs: 1_500,
        timeoutMs: 5_000
      });

      lsCleanExpired("wolium:last_profile_stats:", 1000*60*60*24*7);
      lsJSONSet(lastKey, { t: Date.now(), res });
      renderStats(res);

      if (res?.error) {
        console.error("[profile] stats load error:", res?.error);
        hud.error(res?.error, {title: t("profile.stats_load_error")});
      }

      if (userDiscordId) return res;
      Ids.guilds = res?.guilds ?? {};
      renderGuildOptions(normalizeChartType(chartModal?.dataset?.chartType || "messages"));

      return res;
    } catch (e) {
      const saved = lsJSONGet(lastKey, null);
      if (saved?.res) {
        renderStats(saved.res);
        if (userDiscordId) return saved.res;
        Ids.guilds = saved.res?.guilds ?? {};
        renderGuildOptions(normalizeChartType(chartModal?.dataset?.chartType || "messages"));
        return saved.res;
      }
      throw e;
    }
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
      },
      onTypeChange: syncChartUi
    });

    return chart;
  }

  function openChart(type) {
    const normalizedType = normalizeChartType(type);

    syncChartUi(normalizedType);
    renderGuildOptions(normalizedType);
    chartChannelId.value = "";
    setModalOpen(chartModal, true);

    const c = ensureChart();
    c?.setType(normalizedType);
  }

  function closeChart() {
    setModalOpen(chartModal, false);
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

  chartGuildId.addEventListener("change", () => {
    const type = normalizeChartType(chartModal?.dataset?.chartType || "messages");
    renderChannelOptions(chartGuildId.value, type);
  });

  try {
    await loadStats();
  } catch (e) {
    console.warn("[profile] init failed:", e);
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

  syncChartUi("messages");

  onLangChange(() => {
    const currentType = chartModal?.dataset?.chartType || "messages";

    if (chartModal?.classList.contains("is-open")) {
      syncChartUi(currentType);
      renderGuildOptions(currentType);
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
