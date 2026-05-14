import { t, onLangChange } from "@/lib/text/i18n.js";
import { createWebRequestService } from "@/services/index.js";
import { $, $$, hud, formatDuration, formatNumber } from "@/lib/index.js";

const METRICS = [
  { key: "total_balance", i18n: "leaderboard.metric_total_balance", format: "sparks" },
  { key: "bank_balance", i18n: "leaderboard.metric_bank_balance", format: "sparks" },
  { key: "balance", i18n: "leaderboard.metric_balance", format: "sparks" },
  { key: "upgrade", i18n: "leaderboard.metric_upgrade", format: "number" },
  { key: "total_xp", i18n: "leaderboard.metric_total_xp", format: "number" },
  { key: "level", i18n: "leaderboard.metric_level", format: "number" },
  { key: "experience", i18n: "leaderboard.metric_experience", format: "number" },
  { key: "message_count", i18n: "leaderboard.metric_message_count", format: "number" },
  { key: "voice_time", i18n: "leaderboard.metric_voice_time", format: "time" },
  { key: "votes", i18n: "leaderboard.metric_votes", format: "number" },
  { key: "streak_votes", i18n: "leaderboard.metric_streak_votes", format: "number" },
  { key: "activity_time", i18n: "leaderboard.metric_activity_time", format: "time" },
  { key: "commands", i18n: "leaderboard.metric_commands", format: "number" },
];

const METRICS_MAP = Object.fromEntries(
  METRICS.map(m => [m.key, m])
);

function fmtValue(value, metricKey) {
  if (METRICS_MAP[metricKey]?.format == "sparks") return formatNumber(value ?? 0) + "₩";
  if (METRICS_MAP[metricKey]?.format == "number") return formatNumber(value ?? 0);
  if (METRICS_MAP[metricKey]?.format == "time") return formatDuration(value ?? 0);
  return formatNumber(value ?? 0);
}

function rankBadge(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function rankClass(rank) {
  if (rank === 1) return "lb-row--gold";
  if (rank === 2) return "lb-row--silver";
  if (rank === 3) return "lb-row--bronze";
  return "";
}

function buildAvatar(src, name) {
  if (src) {
    const img = document.createElement("img");
    img.className = "lb-row__avatar";
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    return img;
  }
  const fallback = document.createElement("span");
  fallback.className = "lb-row__avatar lb-row__avatar--fallback";
  fallback.textContent = (name ?? "?")[0].toUpperCase();
  return fallback;
}

function buildRow(entry, { isSelf = false, isServerScope = false, metricKey }) {
  const row = document.createElement("div");
  row.className = [
    "lb-row",
    rankClass(entry.rank),
    isSelf ? "lb-row--own" : "",
    (!isSelf && !isServerScope && entry.user_id) ? "lb-row--link" : "",
  ].filter(Boolean).join(" ");

  const rankEl = document.createElement("span");
  rankEl.className = "lb-row__rank";
  rankEl.textContent = rankBadge(entry.rank);

  const nameEl = document.createElement("span");
  nameEl.className = "lb-row__name";

  if (isServerScope) {
    nameEl.appendChild(buildAvatar(entry.icon ?? null, entry.guild_name));
    const label = document.createElement("span");
    label.className = "lb-row__display text-truncate";
    label.textContent = entry.guild_name ?? t("leaderboard.unknown");
    nameEl.appendChild(label);
  } else {
    nameEl.appendChild(buildAvatar(entry.avatar ?? null, entry.display_name));
    const label = document.createElement("span");
    label.className = "lb-row__display text-truncate";
    label.textContent = entry.display_name ?? t("leaderboard.unknown");
    nameEl.appendChild(label);

    if (!isSelf && entry.user_id) {
      const href = `/profile/?user_id=${entry.user_id}`;
      row.setAttribute("role", "link");
      row.setAttribute("tabindex", "0");
      row.title = entry.display_name ?? "";
      row.addEventListener("click", () => { window.location.href = href; });
      row.addEventListener("keydown", e => { if (e.key === "Enter") window.location.href = href; });
    }
  }

  const valueEl = document.createElement("span");
  valueEl.className = "lb-row__value";
  valueEl.textContent = fmtValue(entry.value, metricKey);

  row.append(rankEl, nameEl, valueEl);
  return row;
}

export async function initLeaderboardPage(sb) {
  const wr = createWebRequestService(sb, {
    defaultCacheTtlMs: 60_000,
    defaultCooldownMs: 1_000,
    defaultTimeoutMs: 15_000,
  });

  const { data } = await sb.auth.getSession();
  const userId = data?.session?.user?.id ?? null;

  const lbCard = $("#lbCard");
  const lbList = $("#lbList");
  const lbOwn = $("#lbOwn");
  const lbTotal = $("#lbTotal");
  const lbSubtitle = $("#lbSubtitle");
  const lbPagination = $("#lbPagination");
  const lbPrevPage = $("#lbPrevPage");
  const lbNextPage = $("#lbNextPage");
  const lbPageLabel = $("#lbPageLabel");
  const lbPageInput = $("#lbPageInput");
  const lbServerSelect = $("#lbServerSelect");
  const lbMetricChips = $("#lbMetricChips");

  const state = {
    metric: METRICS[0].key,
    scope: "world",
    serverId: null,
    page: 1,
    pages: 1,
    loading: false,
  };

  function buildMetricChips() {
    lbMetricChips.innerHTML = "";
    for (const m of METRICS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "news-chip lb-metric-chip";
      btn.dataset.metric = m.key;
      btn.textContent = t(m.i18n);
      if (m.key === state.metric) btn.classList.add("is-active");
      btn.addEventListener("click", () => {
        state.metric = m.key;
        state.page = 1;
        lbMetricChips.querySelectorAll(".lb-metric-chip").forEach(b =>
          b.classList.toggle("is-active", b.dataset.metric === state.metric)
        );
        load();
      });
      lbMetricChips.appendChild(btn);
    }
  }

  function updateScopeUI() {
    $$(".lb-scope-btn").forEach(btn =>
      btn.classList.toggle("is-active",
        btn.dataset.scope === state.scope && state.scope !== "server")
    );
    lbServerSelect.classList.toggle("is-active", state.scope === "server");
  }

  $$(".lb-scope-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.scope = btn.dataset.scope;
      state.serverId = null;
      state.page = 1;
      lbServerSelect.value = "";
      updateScopeUI();
      load();
    });
  });

  lbServerSelect.addEventListener("change", () => {
    const guildId = lbServerSelect.value;
    if (!guildId) return;
    state.scope = "server";
    state.serverId = guildId;
    state.page = 1;
    updateScopeUI();
    load();
  });

  async function loadGuilds() {
    try {
      const res = await wr.queue("user_guilds", {}, {
        cacheTtlMs: 5 * 60_000,
        timeoutMs: 8_000,
      });
      lbServerSelect.innerHTML = `<option value="">${t("leaderboard.select_server")}</option>`;
      if (res?.error) {
        hud.error(res?.error, { title: t("error.load_guilds") });
        console.warn("[leaderboard] guilds load failed:", res?.error);
        return
      }
      for (const g of res) {
        const opt = document.createElement("option");
        opt.value = g?.id;
        opt.textContent = g?.name;
        lbServerSelect.appendChild(opt);
      }
    } catch (e) {
      hud.error(e, { title: t("error.load_guilds") });
      console.warn("[leaderboard] guild load failed:", e);
    }
  }

  function showSkeleton() {
    lbCard.classList.add("loading");
    lbList.innerHTML = "";
    for (let i = 0; i < 10; i++) {
      const row = document.createElement("div");
      row.className = "lb-row skeleton";
      lbList.appendChild(row);
    }
    lbTotal.className = "lb-total skeleton";
    lbSubtitle.className = "lb-subtitle skeleton";
    lbOwn.hidden = true;
    lbPagination.hidden = true;
  }

  function updatePagination() {
    lbPagination.hidden = state.pages <= 1;
    lbPageLabel.textContent = `Page ${state.page} / ${state.pages}`;
    lbPageInput.value = state.page;
    lbPageInput.max = state.pages;
    lbPrevPage.disabled = state.page <= 1;
    lbNextPage.disabled = state.page >= state.pages;
  }

  lbPrevPage.addEventListener("click", () => {
    if (state.page > 1) { state.page--; load(); }
  });
  lbNextPage.addEventListener("click", () => {
    if (state.page < state.pages) { state.page++; load(); }
  });
  lbPageInput.addEventListener("change", () => {
    const v = parseInt(lbPageInput.value, 10);
    if (v >= 1 && v <= state.pages && v !== state.page) { state.page = v; load(); }
  });

  function scopeLabel() {
    if (state.scope === "world") return t("leaderboard.scope_world");
    if (state.scope === "top_servers") return t("leaderboard.scope_top_servers");
    const opt = lbServerSelect.selectedOptions[0];
    return opt?.textContent ?? t("leaderboard.scope_server");
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    showSkeleton();

    const params = { metric: state.metric, scope: state.scope, page: state.page };
    if (state.scope === "server" && state.serverId) params.guild_id = state.serverId;

    try {
      const res = await wr.queue("leaderboard", params, {
        cacheTtlMs: 30_000,
        cooldownMs: 500,
        timeoutMs: 10_000,
      });
      if (res?.error) {
        hud.error(res?.error, { title: t("error.load_guilds") });
        console.warn("[leaderboard] load failed:", e);
        return
      };

      const isServerScope = state.scope === "top_servers";
      const entries = res.entries ?? [];

      const totalStr = (res.total ?? 0).toLocaleString();
      const countUnit = isServerScope
        ? t("leaderboard.unit_servers")
        : t("leaderboard.unit_users");
      lbTotal.textContent = `${totalStr} ${countUnit}`;
      lbTotal.className = "lb-total";
      lbSubtitle.textContent = `${scopeLabel()} · ${t(METRICS.find(m => m.key === state.metric)?.i18n ?? state.metric)}`;
      lbSubtitle.className = "lb-subtitle";

      lbList.innerHTML = "";
      if (entries.length === 0) {
        const empty = document.createElement("div");
        empty.className = "lb-empty";
        empty.textContent = t("leaderboard.empty");
        lbList.appendChild(empty);
      } else {
        for (const entry of entries) {
          lbList.appendChild(buildRow(entry, {
            isServerScope,
            metricKey: state.metric
          }));
        }
      }

      const self = res.self;
      const selfInTop = !isServerScope && !!userId && entries.some(e => e.user_id === userId);

      lbOwn.querySelector(".lb-row")?.remove();
      lbOwn.hidden = true;

      if (self && !selfInTop && !isServerScope) {
        const ownEl = buildRow(self, { isSelf: true, metricKey: state.metric });
        lbOwn.appendChild(ownEl);
        lbOwn.hidden = false;
      }

      state.pages = res.pages ?? 1;
      updatePagination();

      lbCard.classList.remove("loading");
    } catch (e) {
      console.warn("[leaderboard] load failed:", e);
      hud.error(e, t("leaderboard.load_error"));
      lbCard.classList.remove("loading");
    } finally {
      state.loading = false;
    }
  }

  onLangChange(() => buildMetricChips());

  buildMetricChips();
  await loadGuilds();
  await load();
}