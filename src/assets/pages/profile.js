import { $, lsJSONGet, lsJSONSet, lsCleanExpired, readIdentity, escapeHtml, t, onLangChange, hud, formatNumber, on } from "@/lib/index.js";
import { createWebRequestService } from "@/services/index.js";
import { initChart } from "@/lib/chart/chart.js";

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
  if (type === "voice" || type === "user_voice") return "user_voice";
  if (type === "activities" || type === "user_activities") return "user_activities";
  if (type === "commands" || type === "user_commands") return "user_commands";
  return "user_messages";
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

function formatMoney(n) {
  return `${formatNumber(n)}₩`;
}

function setModalOpen(modal, open) {
  if (!modal) return;
  modal.classList.toggle("is-open", open);
  modal.setAttribute("aria-hidden", open ? "false" : "true");
}

function chartTitle(type) {
  if (type === "user_messages") return t("profile.messages");
  if (type === "user_voice") return t("profile.voice");
  if (type === "user_activities") return t("profile.activities");
  return t("chart.title");
}

function field(root, name) {
  return root.querySelector(`[data-field="${name}"]`);
}

export function computeProfileDisplayData(res) {
  const now = Number(res?.xp_now ?? 0);
  const need = Number(res?.xp_need ?? 0);
  const pct = need > 0 ? Math.min(100, Math.max(0, (now / need) * 100)) : 0;

  return {
    name: res?.user_name ?? t("profile.unknown_name"),
    tag: res?.display_name ?? "",
    avatar: res?.user_avatar ?? null,
    levelText: t("profile.level", { level: formatNumber(res?.lvl) }),
    xpLineText: t("profile.xp_line", {
      now: formatNumber(res?.xp_now),
      need: formatNumber(res?.xp_need),
      total: formatNumber(res?.xp)
    }),
    xpPercent: pct,
    status: res?.status ?? null,
    clientStatus: res?.client_status ?? {},
    badges: res?.badges ?? [],
    messages: formatNumber(res?.messages),
    voice: res?.voice_time ?? "00:00",
    activities: res?.activity_seconds ?? "00:00",
    total: formatMoney(res?.total_balance),
    bank: formatMoney(res?.bank_balance),
    cash: formatMoney(res?.balance),
    commands: formatNumber(res?.user_commands),
  };
}

function renderPresenceBadgeState(root, status, clientStatus) {
  const badgeEl = field(root, "presence-badge");
  const useEl = field(root, "presence-use");
  const tooltipEl = field(root, "presence-tooltip");
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

function renderBadgeRow(root, badges) {
  const badgeRowEl = field(root, "badges");
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

export function applyProfileDisplayData(root, res, { interactive = false } = {}) {
  const display = computeProfileDisplayData(res);

  setText(field(root, "stat-messages"), display.messages);
  setText(field(root, "stat-voice"), display.voice);
  setText(field(root, "stat-activities"), display.activities);
  setText(field(root, "stat-money-total"), display.total);
  setText(field(root, "stat-money-bank"), display.bank);
  setText(field(root, "stat-money-cash"), display.cash);
  setText(field(root, "stat-commands"), display.commands);

  setText(field(root, "xp-line"), display.xpLineText);
  setText(field(root, "level"), display.levelText);

  const xpBar = field(root, "xp-bar");
  const xpBarContainer = field(root, "xp-bar-container");
  if (xpBar) {
    xpBar.style.width = `${display.xpPercent}%`;
    if (xpBarContainer) xpBarContainer.ariaValueNow = Math.round(display.xpPercent);
  }

  setText(field(root, "name"), interactive ? display.tag : display.name);
  setText(field(root, "tag"), interactive ? display.name : display.tag);

  const pfp = field(root, "pfp");
  if (pfp && display.avatar) pfp.src = display.avatar;

  renderPresenceBadgeState(root, display.status, display.clientStatus);
  renderBadgeRow(root, display.badges);

  root.querySelector(".profile-card")?.classList.remove("loading");
  root.querySelector(".stats")?.classList.remove("loading");
}

function getParam(key) {
  const params = new URLSearchParams(window.location.search);
  return (params.get(key) || "").trim();
}

export async function initProfilePage(sb) {
  const profileCard = $("#profileCard");
  const profileStats = $("#profileStats");
  const chartModal = $("#chartModal");
  const chartClose = $("#chartClose");
  const chartTitleEl = $("#chartTitle");
  const chartTabs = Array.from(document.querySelectorAll("[data-chart-type]"));
  const chartGuildId = $("#chartGuildId");
  const chartChannelId = $("#chartChannelId");

  if (!profileCard || !profileStats || !chartModal || !chartClose || !chartTitleEl || !chartGuildId || !chartChannelId) {
    return null;
  }

  const profilePfp = field(profileCard, "pfp");
  const profileName = field(profileCard, "name");
  const profileTag = field(profileCard, "tag");
  const profilePresenceTooltip = field(profileCard, "presence-tooltip");
  const profilePfpWrap = profilePfp?.closest(".pfp-wrap") || null;

  const userDiscordId = getParam("user_id") || "";

  const Ids = { guilds: {} };
  let lastProfileResponse = null;
  let chart = null;

  for (const tab of chartTabs) {
    if (!String(tab.dataset.chartType || "").startsWith("user_")) {
      tab.dataset.chartType = `user_${tab.dataset.chartType}`;
    }
  }

  const wr = createWebRequestService(sb, {
    defaultCacheTtlMs: 30_000,
    defaultCooldownMs: 1_500,
    defaultTimeoutMs: 15_000
  });

  const queueChart = wr.makeLatestDebouncedQueue({
    debounceMs: 200,
    kinds: new Set(["user_messages_series", "user_voice_series", "user_activities_series", "user_commands_series"]),
  });

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
    if (type == "user_voice") {
      channels = Ids.guilds?.[guildId]?.voice_channels;
    } else {
      channels = Ids.guilds?.[guildId]?.message_channels;
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

  function renderGuildOptions(type = "") {
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
    } catch { }
  }

  function renderStats(res) {
    lastProfileResponse = res ?? null;
    applyProfileDisplayData(profileCard.parentElement ?? document, res, { interactive: true });

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

    setHidden($("#commandsTab"), false);

    try {
      const res = await wr.queue("user_profile_stats", { "user_id": userDiscordId }, {
        cacheTtlMs: 30_000,
        cooldownMs: 1_500,
        timeoutMs: 5_000
      });

      lsCleanExpired("wolium:last_profile_stats:", 1000 * 60 * 60 * 24 * 7);
      lsJSONSet(lastKey, { t: Date.now(), res });
      renderStats(res);

      if (res?.error) {
        console.error("[profile] stats load error:", res?.error);
        hud.error(res?.error, { title: t("profile.stats_load_error") });
      }

      if (userDiscordId) return res;
      Ids.guilds = res?.guilds ?? {};
      renderGuildOptions(normalizeChartType(chartModal?.dataset?.chartType || "user_messages"));

      return res;
    } catch (e) {
      const saved = lsJSONGet(lastKey, null);
      if (saved?.res) {
        renderStats(saved.res);
        if (userDiscordId) return saved.res;
        Ids.guilds = saved.res?.guilds ?? {};
        renderGuildOptions(normalizeChartType(chartModal?.dataset?.chartType || "user_messages"));
        return saved.res;
      }
      throw e;
    }
  }

  function ensureChart() {
    if (chart) return chart;

    chart = initChart(queueChart, {
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
    profilePfpWrap.addEventListener("mouseenter", () => setPresenceTooltipOpen(profilePresenceTooltip, true));
    profilePfpWrap.addEventListener("mouseleave", () => setPresenceTooltipOpen(profilePresenceTooltip, false));
    profilePfpWrap.addEventListener("focusin", () => setPresenceTooltipOpen(profilePresenceTooltip, true));
    profilePfpWrap.addEventListener("focusout", () => setPresenceTooltipOpen(profilePresenceTooltip, false));
  }

  chartGuildId.addEventListener("change", () => {
    const type = normalizeChartType(chartModal?.dataset?.chartType || "user_messages");
    renderChannelOptions(chartGuildId.value, type);
  });

  document.querySelectorAll("[data-chart-type]").forEach((el) => {
    on(el, "click", (e) => {
      e.stopPropagation();
      setTimeout(() => {
        const type = normalizeChartType(chartModal?.dataset?.chartType || "user_messages");
        renderChannelOptions(chartGuildId.value, type);
      }, 0);
    });
  });

  try {
    await loadStats();
  } catch (e) {
    console.warn("[profile] init failed:", e);
  }

  profileStats.addEventListener("click", (e) => {
    const btn = e.target.closest(".stat--link");
    const type = btn?.dataset?.chart;
    if (!type) return;

    openChart(type);
  });

  chartClose.addEventListener("click", closeChart);
  chartModal.addEventListener("click", (e) => {
    if (e.target === chartModal) closeChart();
  });

  syncChartUi("user_messages");

  onLangChange(() => {
    const currentType = chartModal?.dataset?.chartType || "user_messages";

    if (chartModal?.classList.contains("is-open")) {
      syncChartUi(currentType);
      renderGuildOptions(currentType);
    } else {
      setText(chartTitleEl, t("chart.title"));
    }

    if (lastProfileResponse) {
      renderPresenceBadgeState(profileCard.parentElement ?? document, lastProfileResponse?.status, lastProfileResponse?.client_status);
      renderBadgeRow(profileCard.parentElement ?? document, lastProfileResponse?.badges);
    }
  });

  return chart;
}