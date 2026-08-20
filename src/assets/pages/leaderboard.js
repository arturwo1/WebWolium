import { createWebRequestService } from "@/services/index.js";
import { $, $$, hud, formatDuration, formatNumber, t, onLangChange } from "@/lib/index.js";
import { METRICS, fmtValue, buildRow } from "@/lib/leaderboard/leaderboardRow.js";
import { buildMetricChips } from "@/lib/leaderboard/metricChips.js";

const formatters = { number: formatNumber, duration: formatDuration };

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

  function rebuildMetricChips() {
    buildMetricChips(lbMetricChips, state.metric, t, (metricKey) => {
      state.metric = metricKey;
      state.page = 1;
      load();
    });
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
    lbPageLabel.textContent = t("news.pagination.page_line", {
      current: state.page,
      total: state.pages
    });
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
        timeoutMs: 10_000
      });
      if (res?.error) {
        hud.error(res?.error, { title: t("error.load_guilds") });
        console.warn("[leaderboard] load failed:", res?.error);
        return
      };

      const isServerScope = state.scope === "top_servers";
      const entries = res.entries ?? [];

      const totalStr = (res.total_users ?? 0).toLocaleString();
      const countUnit = isServerScope
        ? t("leaderboard.unit_servers")
        : t("leaderboard.unit_users");
      lbTotal.textContent = `${totalStr} ${countUnit}`;
      lbTotal.className = "lb-total";
      lbSubtitle.textContent = `${scopeLabel()} · ${t(METRICS.find(m => m.key === state.metric)?.i18nKey ?? state.metric)} · ${fmtValue(res.total_value ?? 0, state.metric, formatters)}`;
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
          }, t, formatters));
        }
      }

      const self = res.self;
      const selfInTop = !isServerScope && !!userId && entries.some(e => e.user_id === userId);

      lbOwn.querySelector(".lb-row")?.remove();
      lbOwn.hidden = true;

      if (self && !selfInTop && !isServerScope) {
        const ownEl = buildRow(self, { isSelf: true, metricKey: state.metric }, t, formatters);
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

  onLangChange(() => rebuildMetricChips());

  rebuildMetricChips();
  await loadGuilds();
  await load();
}