import { $, clamp, escapeHtml, on, parseLocalInput, toLocalDatetimeValue, t, onLangChange } from "@/lib/index.js";
import { niceBucketMs, normalizeSeriesPoint } from "./chart-utils.js";
import { makeDrawer } from "./chart-draw.js";
import { makeTooltip } from "./chart-tooltip.js";
import { attachInteractions } from "./chart-interaction.js";
import { resolveType, normalizeType, TYPE_REGISTRY } from "./chart-types.js";

export function initChart(queueRequest, opts = {}) {
  const canvas = $("#chartCanvas");
  const chartFrom = $("#chartFrom");
  const chartTo = $("#chartTo");
  const chartSum = $("#chartSum");
  const chartPreset = $("#chartPreset");
  const chartModal = $("#chartModal");

  const els = {
    chartGuildId: $("#chartGuildId"),
    chartChannelId: $("#chartChannelId"),
    chartRoleId: $("#chartRoleId"),
    chartContext: $("#chartContext"),
    chartCommandName: $("#chartCommandName"),
    chartVoiceMinDuration: $("#chartVoiceMinDuration"),
    chartVoiceMaxDuration: $("#chartVoiceMaxDuration"),
    chartActivityName: $("#chartActivityName"),
    chartActivityStatus: $("#chartActivityStatus"),
    chartActivityMinDuration: $("#chartActivityMinDuration"),
    chartActivityMaxDuration: $("#chartActivityMaxDuration"),
    chartActivityMore: $("#chartActivityMore"),
    chartActivityTrack: $("#chartActivityTrack"),
    chartActivityAlbum: $("#chartActivityAlbum"),
    chartActivityArtist: $("#chartActivityArtist")
  };

  const optionEls = {
    average: $("#chartOptionsAverage"),
    compare: $("#chartOptionsCompare"),
    delta: $("#chartOptionsDelta")
  };

  const tip = $("#chartTooltip");
  const tipTime = $("#tipTime");
  const tipVal = $("#tipVal");
  const tipPreview = $("#tipPreview");

  if (!canvas || !chartFrom || !chartTo) return null;

  const debug = !!opts.debug;
  const guildId = String(opts.guildId ?? "").trim();
  const defaultDays = Number(opts.defaultDays ?? 30);
  const snapMs = Number(opts.snapMs ?? 60_000);
  const reqOpts = {
    cacheTtlMs: Number(opts.cacheTtlMs ?? 30_000),
    cooldownMs: Number(opts.cooldownMs ?? 1_500),
    timeoutMs: Number(opts.timeoutMs ?? 80_000)
  };
  const viewer = {
    name: opts.viewer?.name ?? t("common.user"),
    avatar: opts.viewer?.avatar ?? null
  };
  const onTypeChange = typeof opts.onTypeChange === "function" ? opts.onTypeChange : null;

  const state = {
    type: "user_messages",
    dataMin: 0,
    dataMax: 0,
    viewMin: 0,
    viewMax: 0,
    series: [],
    bucketMs: 0,
    yMax: 1,
    hoverIdx: -1,
    hoverKind: null,
    dragging: false,
    dragStartX: 0,
    dragStartMin: 0,
    dragStartMax: 0,
    padL: 70,
    compareSeries: [],
    options: {
      average: !!optionEls.average?.checked,
      compare: !!optionEls.compare?.checked,
      delta: !!optionEls.delta?.checked
    }
  };

  let reqSeq = 0;
  let refreshTimer = null;
  let refetchTimer = null;
  let activityMoreOpen = false;

  function log(...a) {
    if (debug) console.log("[chart]", ...a);
  }

  function toggleHidden(el, hidden) {
    if (el) el.hidden = !!hidden;
  }

  function syncFilterUi() {
    const allFilterIds = new Set(
      Object.values(TYPE_REGISTRY).flatMap((def) => def.filterIds ?? [])
    );

    const activeIds = new Set(resolveType(state.type).filterIds ?? []);

    for (const id of allFilterIds) {
      const el = els[id] ?? $("#" + id);
      if (!el) continue;

      if (id === "chartActivityTrack" || id === "chartActivityAlbum" || id === "chartActivityArtist") {
        toggleHidden(el, !(activeIds.has(id) && activityMoreOpen));
      } else {
        toggleHidden(el, !activeIds.has(id));
      }
    }
  }

  function renderActivityStatusOptions() {
    const el = els.chartActivityStatus;
    if (!el) return;

    const current = el.value;

    const options = [
      { value: "", label: t("chart.filter.status.any") },
      { value: "online", label: t("profile.status.online") },
      { value: "idle", label: t("profile.status.idle") },
      { value: "dnd", label: t("profile.status.dnd") },
      { value: "offline", label: t("profile.status.offline") }
    ];

    el.innerHTML = options.map((opt) => `
      <option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>
    `).join("");

    el.value = options.some((x) => x.value === current) ? current : "";
  }

  function summaryText() {
    return resolveType(state.type).summaryText(state.series);
  }

  const drawer = makeDrawer(canvas, state);

  const tooltip = makeTooltip(tip, tipTime, tipVal, tipPreview, canvas, state, viewer);

  function scheduleRefetchIfBucketChanged(ms = 260) {
    if (refetchTimer) clearTimeout(refetchTimer);
    refetchTimer = setTimeout(() => {
      refetchTimer = null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 10) return;
      const desired = niceBucketMs(state.viewMax - state.viewMin, rect.width);
      if (!state.bucketMs || desired !== state.bucketMs) scheduleRefresh(0);
    }, ms);
  }

  attachInteractions(canvas, state, tooltip, drawer, scheduleRefetchIfBucketChanged);

  function scheduleRefresh(ms = 180) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refreshChartDataAndRender();
    }, ms);
  }

  async function refreshChartDataAndRender() {
    chartModal.classList.add("loading");
    const mySeq = ++reqSeq;

    const vFrom = parseLocalInput(chartFrom.value);
    const vTo = parseLocalInput(chartTo.value);

    const snappedNow = Math.floor(Date.now() / snapMs) * snapMs;
    const minT = vFrom ?? (snappedNow - defaultDays * 864e5);
    const maxT = vTo ?? snappedNow;

    state.dataMin = minT;
    state.dataMax = maxT;

    if (!state.viewMin || !state.viewMax || state.viewMin < minT || state.viewMax > maxT) {
      state.viewMin = minT;
      state.viewMax = maxT;
    }

    const rect = canvas.getBoundingClientRect();
    const widthPx = Math.max(10, rect.width || 600);

    const bucketMs = niceBucketMs(state.viewMax - state.viewMin, widthPx);
    state.bucketMs = bucketMs;

    const typeDef = resolveType(state.type);

    const limit = clamp(Math.floor(widthPx / 3), 160, 500);

    const payload = typeDef.buildPayload(
      {
        from: state.viewMin,
        to: state.viewMax,
        bucketMs,
        limit,
        guildId
      },
      els
    );

    try {
      const rows = await queueRequest(typeDef.kind, payload, reqOpts);
      if (mySeq !== reqSeq) return;
      const arr = Array.isArray(rows) ? rows : [];
      state.series = arr.map(normalizeSeriesPoint).filter(Boolean);
    } catch (e) {
      if (mySeq !== reqSeq) return;
      log("load failed:", e);
      state.series = [];
    }

    if (state.options.compare) {
      const rangeLen = state.dataMax - state.dataMin;
      const compareFrom = state.dataMin - rangeLen;
      const compareTo = state.dataMin;

      const comparePayload = typeDef.buildPayload(
        { from: compareFrom, to: compareTo, bucketMs, limit, guildId },
        els
      );

      try {
        const compareRows = await queueRequest(typeDef.kind, comparePayload, reqOpts);
        if (mySeq !== reqSeq) return;
        const cArr = Array.isArray(compareRows) ? compareRows : [];
        state.compareSeries = cArr
          .map(normalizeSeriesPoint)
          .filter(Boolean)
          .map((p) => ({ ...p, originalTs: p.ts, ts: p.ts + rangeLen }));
      } catch (e) {
        if (mySeq !== reqSeq) return;
        log("compare load failed:", e);
        state.compareSeries = [];
      }
    } else {
      state.compareSeries = [];
    }

    drawer.renderWhenVisible();

    if (chartSum) chartSum.textContent = summaryText();
    chartModal.classList.remove("loading");
  }

  function setRangeMs(fromMs, toMs) {
    if (fromMs == null || toMs == null) {
      chartFrom.value = "";
      chartTo.value = "";
    } else {
      chartFrom.value = toLocalDatetimeValue(fromMs);
      chartTo.value = toLocalDatetimeValue(toMs);
    }

    state.viewMin = 0;
    state.viewMax = 0;
    scheduleRefresh(0);
  }

  function applyPresetValue(v) {
    const now = Date.now();
    if (v === "7d") return setRangeMs(now - 7 * 864e5, now);
    if (v === "30d") return setRangeMs(now - 30 * 864e5, now);
    if (v === "90d") return setRangeMs(now - 90 * 864e5, now);

    if (v === "custom") {
      state.viewMin = 0;
      state.viewMax = 0;
      scheduleRefresh(0);
    }
  }

  function setPreset(v) {
    if (!chartPreset) return;
    if (chartPreset.value !== v) chartPreset.value = v;
  }

  function applyType(type, { force = false } = {}) {
    const nextType = normalizeType(type);
    const changed = nextType !== state.type;

    state.type = nextType;
    onTypeChange?.(nextType);
    syncFilterUi();

    if (!changed && !force) return;

    state.viewMin = 0;
    state.viewMax = 0;

    if (tooltip.hasTip) tooltip.hideTip();
    scheduleRefresh(0);
  }

  function onManualRangeEdit() {
    if (chartPreset) setPreset("custom");
    scheduleRefresh();
  }

  if (chartPreset) {
    chartPreset.addEventListener("change", () => applyPresetValue(chartPreset.value));
    applyPresetValue(chartPreset.value);
  }

  on(chartFrom, "input", onManualRangeEdit);
  on(chartTo, "input", onManualRangeEdit);
  on(chartFrom, "change", onManualRangeEdit);
  on(chartTo, "change", onManualRangeEdit);

  on(els.chartGuildId, "change", onManualRangeEdit);
  on(els.chartChannelId, "change", onManualRangeEdit);
  on(els.chartRoleId, "change", onManualRangeEdit);

  on(els.chartContext, "input", () => scheduleRefresh(400));
  on(els.chartContext, "change", onManualRangeEdit);

  on(els.chartVoiceMinDuration, "input", () => scheduleRefresh(300));
  on(els.chartVoiceMaxDuration, "input", () => scheduleRefresh(300));
  on(els.chartVoiceMinDuration, "change", onManualRangeEdit);
  on(els.chartVoiceMaxDuration, "change", onManualRangeEdit);

  on(els.chartActivityName, "input", () => scheduleRefresh(300));
  on(els.chartActivityName, "change", onManualRangeEdit);
  on(els.chartActivityStatus, "change", onManualRangeEdit);

  on(els.chartActivityMinDuration, "input", () => scheduleRefresh(300));
  on(els.chartActivityMaxDuration, "input", () => scheduleRefresh(300));
  on(els.chartActivityMinDuration, "change", onManualRangeEdit);
  on(els.chartActivityMaxDuration, "change", onManualRangeEdit);

  on(els.chartActivityTrack, "input", () => scheduleRefresh(300));
  on(els.chartActivityAlbum, "input", () => scheduleRefresh(300));
  on(els.chartActivityArtist, "input", () => scheduleRefresh(300));
  on(els.chartActivityTrack, "change", onManualRangeEdit);
  on(els.chartActivityAlbum, "change", onManualRangeEdit);
  on(els.chartActivityArtist, "change", onManualRangeEdit);

  on(els.chartCommandName, "input", () => scheduleRefresh(400));
  on(els.chartCommandName, "change", onManualRangeEdit);

  on(els.chartActivityMore, "click", () => {
    activityMoreOpen = !activityMoreOpen;
    syncFilterUi();
  });

  on(optionEls.average, "change", () => {
    state.options.average = !!optionEls.average.checked;
    drawer.renderWhenVisible();
  });

  on(optionEls.delta, "change", () => {
    state.options.delta = !!optionEls.delta.checked;
    drawer.renderWhenVisible();
  });

  on(optionEls.compare, "change", () => {
    state.options.compare = !!optionEls.compare.checked;
    scheduleRefresh(0);
  });

  on(window, "resize", () => {
    if (!chartModal || chartModal.classList.contains("is-open")) drawer.renderWhenVisible();
  });

  if (chartModal) {
    const obs = new MutationObserver(() => {
      if (chartModal.classList.contains("is-open")) drawer.renderWhenVisible();
    });
    obs.observe(chartModal, { attributes: true, attributeFilter: ["class"] });
  }

  document.querySelectorAll("[data-chart-type]").forEach((el) => {
    on(el, "click", (e) => {
      e.stopPropagation();
      applyType(String(el.getAttribute("data-chart-type") || ""));
    });
  });

  onLangChange(() => {
    renderActivityStatusOptions();
    syncFilterUi();
    if (chartSum) chartSum.textContent = summaryText();
    if (state.series.length) drawer.renderWhenVisible();
  });

  renderActivityStatusOptions();
  syncFilterUi();
  scheduleRefresh(0);

  return {
    refresh: () => scheduleRefresh(0),
    setType: (type) => applyType(type)
  };
}