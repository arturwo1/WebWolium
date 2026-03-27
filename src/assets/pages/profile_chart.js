import {
  $,
  clamp,
  escapeHtml,
  formatAxisTime,
  formatDiscordTime,
  formatDuration,
  formatTsFull,
  on,
  parseLocalInput,
  renderDiscordMarkdownToHtml,
  toLocalDatetimeValue
} from "@/lib/index.js";

import { t, onLangChange } from '@/lib/text/i18n.js';

function niceBucketMs(rangeMs, widthPx) {
  const targetPoints = clamp(Math.floor(widthPx / 4), 120, 260);
  const ideal = rangeMs / Math.max(1, targetPoints);

  const STEPS = [
    1_000,
    5_000,
    10_000,
    30_000,
    60_000,
    5 * 60_000,
    15 * 60_000,
    60 * 60_000,
    6 * 60 * 60_000,
    12 * 60 * 60_000,
    864e5,
    7 * 864e5,
    30 * 864e5
  ];

  for (const s of STEPS) {
    if (s >= ideal) return s;
  }
  return STEPS[STEPS.length - 1];
}

function normalizeSeriesPoint(p) {
  if (!p || typeof p !== "object") return null;
  const ts = Number(p.ts);
  const y = Number(p.y ?? 0);
  if (!Number.isFinite(ts) || !Number.isFinite(y)) return null;

  const bs = p.bucket_start == null ? null : Number(p.bucket_start);
  const be = p.bucket_end == null ? null : Number(p.bucket_end);

  const bucket = (Number.isFinite(bs) && Number.isFinite(be))
    ? { start: bs, end: be }
    : null;

  return {
    ts,
    y,
    bucket,
    sample_content: p.sample_content ?? p.sample ?? null,
    sample_url: p.sample_url ?? p.url ?? null,
    meta: p.meta ?? null,
    sample_attachments: p.sample_attachments ?? null
  };
}

function parseAttachments(raw) {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw.map(String).filter(Boolean);
  }

  if (typeof raw !== "string") return [];

  const value = raw.trim();
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean);
    }
  } catch {}
}

function isImageUrl(url) {
  try {
    const { pathname } = new URL(url);
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif)$/i.test(pathname);
  } catch {
    return false;
  }
}

function replaceImageLinksInHtml(html) {
  const container = document.createElement("div");
  container.innerHTML = html;

  const links = container.querySelectorAll("a[href]");

  for (const link of links) {
    const href = (link.getAttribute("href") || "").trim();
    const textUrl = (link.textContent || "").trim();

    const candidate = isImageUrl(textUrl) ? textUrl : (isImageUrl(href) ? href : null);
    if (!candidate) continue;

    const img = document.createElement("img");
    img.className = "msg-preview__inlineImage";
    img.src = candidate;
    img.alt = "Image";
    img.loading = "lazy";

    link.replaceWith(img);
  }

  return container.innerHTML;
}

function renderAttachmentsHtml(attachments) {
  const imageAttachments = attachments.filter(isImageUrl);
  if (!imageAttachments.length) return "";

  return `
    <div class="msg-preview__attachments">
      ${imageAttachments.map(url => `
        <img
          class="msg-preview__attachmentImg"
          src="${escapeHtml(url)}"
          alt="Image"
          loading="lazy"
        />
      `).join("")}
    </div>
  `;
}

export function initProfileChart(queueRequest, opts = {}) {
  const canvas = $("#chartCanvas");
  const chartFrom = $("#chartFrom");
  const chartTo = $("#chartTo");
  const chartGuildId = $("#chartGuildId");
  const chartChannelId = $("#chartChannelId");
  const chartContext = $("#chartContext");
  const chartSum = $("#chartSum");
  const chartPreset = $("#chartPreset");
  const chartModal = $("#chartModal");

  const tip = $("#chartTooltip");
  const tipTime = $("#tipTime");
  const tipVal = $("#tipVal");
  const tipPreview = $("#tipPreview");
  const hasTip = !!(tip && tipTime && tipVal && tipPreview);
  const tipHost = canvas?.closest(".chart") || document.body;

  if (!canvas || !chartFrom || !chartTo) return null;

  const ctx = canvas.getContext("2d");
  let DPR = 1;

  const debug = !!opts.debug;
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

  const state = {
    type: "messages",
    dataMin: 0,
    dataMax: 0,
    viewMin: 0,
    viewMax: 0,
    series: [],
    bucketMs: 0,
    yMax: 1,
    hoverIdx: -1,
    dragging: false,
    dragStartX: 0,
    dragStartMin: 0,
    dragStartMax: 0
  };

  let reqSeq = 0;
  let refreshTimer = null;
  let refetchTimer = null;

  let tipHover = false;
  let tipPoint = null;

  const HIDE_DELAY_FROM_CANVAS = 0;
  const HIDE_DELAY_FROM_TIP = 10;

  let tipHideTimer = null;

  function scheduleHideTip(ms = 180) {
    if (!hasTip) return;
    if (tipHideTimer) clearTimeout(tipHideTimer);
    tipHideTimer = setTimeout(() => {
      tipHideTimer = null;
      if (!tipHover) tip.classList.remove("is-on");
    }, ms);
  }

  function cancelHideTip() {
    if (tipHideTimer) clearTimeout(tipHideTimer);
    tipHideTimer = null;
  }

  function log(...a) {
    if (debug) console.log("[chart]", ...a);
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function fillRect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function strokeRect(x, y, w, h, c) { ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h); }
  function line(x1, y1, x2, y2, c) { ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function circle(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

  function kindForType() {
    if (state.type === "voice") return "voice_series";
    if (state.type === "activities") return "activities_series";
    return "messages_series";
  }

  function summaryText() {
    if (!state.series.length) {
      return state.type === "messages"
        ? t("chart.summary.messages", { count: 0 })
        : t("chart.summary.time", { value: "0s" });
    }

    const sum = state.series.reduce((a, p) => a + (p.y || 0), 0);

    if (state.type === "messages") {
      return t("chart.summary.messages", { count: Math.round(sum) });
    }

    return t("chart.summary.time", { value: formatDuration(sum) });
  }

  function renderMessagePreview(p) {
    const meta = p?.meta ?? {};

    const guildName = meta.guild_name ?? t("common.server");
    const channelName = meta.channel_name ?? t("common.channel");

    const ts = meta.created_at ?? meta.timestamp ?? null;

    const authorName = viewer.name ?? t("common.user");
    const authorAvatar = viewer.avatar ?? null;

    const text = String(p?.sample_content ?? "").trim();
    const url = meta.url ?? null;

    const attachments = parseAttachments(p?.sample_attachments);

    const safeText = !text && attachments.length ? "" : text ? text : t("chart.preview.no_preview");

    const rawBodyHtml = renderDiscordMarkdownToHtml(safeText);
    const bodyHtml = replaceImageLinksInHtml(rawBodyHtml);
    const attachmentsHtml = renderAttachmentsHtml(attachments);

    return `
      <div class="msg-preview__bar">
        <span class="msg-preview__dot" aria-hidden="true"></span>
        <div class="msg-preview__guild" title="${escapeHtml(guildName)}">${escapeHtml(guildName)}</div>
        <div class="msg-preview__channel" title="#${escapeHtml(channelName)}">${escapeHtml(channelName)}</div>
      </div>

      <div class="msg-preview__row">
        <div class="msg-preview__avatar" aria-hidden="true">
          ${authorAvatar
            ? `<img class="msg-preview__avatarImg" src="${escapeHtml(authorAvatar)}" alt="" loading="lazy" />`
            : `<span class="msg-preview__avatarFallback">${escapeHtml((authorName[0] || "U").toUpperCase())}</span>`
          }
        </div>

        <div class="msg-preview__content">
          <div class="msg-preview__meta">
            <span class="msg-preview__author">${escapeHtml(authorName)}</span>
            ${ts ? `<span class="msg-preview__time">${escapeHtml(formatDiscordTime(ts))}</span>` : ``}
          </div>

          <div class="msg-preview__text md">
            ${bodyHtml}
          </div>

          ${attachmentsHtml}
        </div>
      </div>
      
      ${url && Math.round(p.y)==1 ? `
        <div class="msg-preview__hint">
          <span class="msg-preview__kbd js-preview-click">${t("chart.preview.click")}</span>
          <span class="msg-preview__hintText" >${t("chart.preview.discord")}</span>
        </div>
      ` : url ? `
        <div class="msg-preview__hint">
          <span class="msg-preview__kbd">${t("chart.preview.scroll")}</span>
          <span class="msg-preview__hintText">${t("chart.preview.scroll_down")}</span>
        </div>
      ` : `
        <div class="msg-preview__hint">
          <span class="msg-preview__hintText">${t("chart.preview.unavailable")}</span>
        </div>`}`;
    }

  function renderVoicePreview(p) {
    const meta = p?.meta ?? {};
    const guild = meta.guild_id ?? meta.guild ?? t("common.server");
    const chan = meta.channel_id ?? meta.channel ?? t("chart.type.voice");
    return `
      <div class="prev-voice">
        <div class="prev-voice__row">
          <span class="prev-badge">${escapeHtml(guild)}</span>
          <span class="prev-badge">${escapeHtml(chan)}</span>
        </div>
      </div>
    `;
  }

  function renderActivityPreview(p) {
    const meta = p?.meta ?? {};
    const name = meta.name ?? meta.activity ?? t("chart.type.activities");
    return `
      <div class="prev-act">
        <div class="prev-body">${escapeHtml(name)}</div>
      </div>
    `;
  }

  function hideTip() {
    if (!hasTip) return;
    tip.classList.remove("is-on");
    tipPoint = null;
  }

  function placeTooltipAtPoint(px, py) {
    if (!hasTip) return;

    const margin = 12;
    const offset = 14;

    const hostRect = tipHost.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const x = (canvasRect.left - hostRect.left) + px;
    const y = (canvasRect.top - hostRect.top) + py;

    const hostW = hostRect.width;
    const hostH = hostRect.height;

    const maxH = Math.max(140, hostH - margin * 2);
    tip.style.maxHeight = `${Math.floor(maxH)}px`;
    tip.style.overflow = "auto";

    const r = tip.getBoundingClientRect();
    const w = r.width || 260;
    const h = r.height || 140;

    let left = x + offset;
    let top = y + offset;

    if (left + w > hostW - margin) left = x - w - offset;
    if (top + h > hostH - margin) top = y - h - offset;

    left = clamp(left, margin, hostW - w - margin);
    top = clamp(top, margin, hostH - h - margin);

    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function showTooltipForPoint(p, px, py) {
    if (!hasTip) return;

    tip.classList.add("is-on");
    cancelHideTip();

    const hasBucket = !!p.bucket;
    const tStart = hasBucket ? p.bucket.start : p.ts;
    const tEnd = hasBucket ? p.bucket.end : p.ts;

    tipTime.textContent = hasBucket
      ? `${formatTsFull(tStart)} — ${formatTsFull(tEnd)}`
      : formatTsFull(p.ts);

    if (state.type === "messages") {
      tipVal.textContent = `${t("chart.tooltip.messages")}: ${Math.round(p.y)}`;
      tipPreview.innerHTML = renderMessagePreview(p);
    } else if (state.type === "voice") {
      tipVal.textContent = `${t("chart.tooltip.voice")}: ${formatDuration(p.y || 0)}`;
      tipPreview.innerHTML = renderVoicePreview(p);
    } else {
      tipVal.textContent = `${t("chart.tooltip.time")}: ${formatDuration(p.y || 0)}`;
      tipPreview.innerHTML = renderActivityPreview(p);
    }

    tipPoint = p;
    requestAnimationFrame(() => placeTooltipAtPoint(px, py));
  }

  function renderWhenVisible(tries = 90) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width >= 10 && rect.height >= 10) {
      render();
      return;
    }
    if (tries <= 0) {
      log("give up render: still hidden");
      return;
    }
    requestAnimationFrame(() => renderWhenVisible(tries - 1));
  }

  function render() {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    canvas.width = Math.floor(rect.width * DPR);
    canvas.height = Math.floor(rect.height * DPR);

    const visible = state.series.filter((p) => p.ts >= state.viewMin && p.ts <= state.viewMax);
    const ys = visible.map((p) => p.y);
    state.yMax = (ys.length ? Math.max(1, ...ys) : 1) * 1.15;

    if (chartSum) chartSum.textContent = summaryText();

    state.hoverIdx = -1;
    if (hasTip && !tipHover) hideTip();

    drawChart();
  }

  function drawChart() {
    const W = canvas.width / DPR;
    const H = canvas.height / DPR;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const padL = 70, padR = 18, padT = 16, padB = 42;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const rgbBg = cssVar("--rgb-bg") || "35,39,42";
    const rgbBorder = cssVar("--rgb-border") || "43,49,55";
    const rgbPrimary = cssVar("--rgb-primary") || "128,224,245";
    const rgbSecondary = cssVar("--rgb-secondary") || "173,176,179";

    fillRect(0, 0, W, H, `rgba(${rgbBg}, 1)`);
    strokeRect(0.5, 0.5, W - 1, H - 1, `rgba(${rgbBorder}, 1)`);

    const xOf = (t) => padL + ((t - state.viewMin) / (state.viewMax - state.viewMin)) * plotW;
    const yOf = (v) => padT + (1 - (v / state.yMax)) * plotH;

    const grid = 4;
    ctx.font = "12px system-ui";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = `rgba(${rgbSecondary}, 1)`;

    for (let i = 0; i <= grid; i++) {
      const y = padT + (plotH * i) / grid;
      const a = i === grid ? 0.7 : 0.35;
      line(padL, y, W - padR, y, `rgba(${rgbBorder}, ${a})`);

      const val = state.yMax * (1 - i / grid);
      const label = state.type === "messages"
        ? String(Math.round(val))
        : formatDuration(val);
      ctx.fillText(label, padL - 10, y);
    }

    const rangeMs = state.viewMax - state.viewMin;
    const xTicks = rangeMs > 3 * 365 * 864e5 ? 6 : rangeMs > 120 * 864e5 ? 5 : 4;

    ctx.textBaseline = "top";
    ctx.fillStyle = `rgba(${rgbSecondary}, 1)`;

    for (let i = 0; i <= xTicks; i++) {
      const t = state.viewMin + (rangeMs * i) / xTicks;
      const rawX = padL + (plotW * i) / xTicks;
      const label = formatAxisTime(t, rangeMs, state.viewMin, state.viewMax);

      if (i === 0) ctx.textAlign = "left";
      else if (i === xTicks) ctx.textAlign = "right";
      else ctx.textAlign = "center";

      let x = rawX;
      if (i === 0) x = rawX + 2;
      if (i === xTicks) x = rawX - 2;

      line(rawX, padT + plotH, rawX, padT + plotH + 6, `rgba(${rgbBorder}, .8)`);
      ctx.fillText(label, x, padT + plotH + 10);
    }

    const s = state.series.filter((p) => p.ts >= state.viewMin && p.ts <= state.viewMax);

    if (!s.length) {
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `rgba(${rgbSecondary}, 1)`;
      ctx.fillText(t("chart.no_data"), W / 2, H / 2);
      return;
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(${rgbPrimary}, .9)`;
    ctx.beginPath();
    s.forEach((p, i) => {
      const x = xOf(p.ts);
      const y = yOf(p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    s.forEach((p, i) => {
      const x = xOf(p.ts);
      const y = yOf(p.y);
      const r = (i === state.hoverIdx) ? 6 : 4;
      circle(x, y, r, `rgba(${rgbPrimary}, 1)`);
    });
  }

  function scheduleRefresh(ms = 180) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refreshChartDataAndRender();
    }, ms);
  }

  function scheduleRefetchIfBucketChanged(ms = 260) {
    if (refetchTimer) clearTimeout(refetchTimer);
    refetchTimer = setTimeout(() => {
      refetchTimer = null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 10) return;
      const desired = niceBucketMs(state.viewMax - state.viewMin, rect.width);
      if (!state.bucketMs || desired !== state.bucketMs) {
        scheduleRefresh(0);
      }
    }, ms);
  }

  async function refreshChartDataAndRender() {
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

    const qFrom = state.viewMin;
    const qTo = state.viewMax;

    const bucketMs = niceBucketMs(qTo - qFrom, widthPx);
    state.bucketMs = bucketMs;

    const payload = {
      from: qFrom,
      to: qTo,
      bucket_ms: bucketMs,
      limit: clamp(Math.floor(widthPx / 3), 160, 500),
      guild_id: chartGuildId.value,
      channel_id: chartChannelId.value,
      context: chartContext.value
    };
    console.log(payload)

    try {
      const rows = await queueRequest(kindForType(), payload, reqOpts);
      if (mySeq !== reqSeq) return;

      const arr = Array.isArray(rows) ? rows : [];
      state.series = arr.map(normalizeSeriesPoint).filter(Boolean);

      renderWhenVisible();
    } catch (e) {
      if (mySeq !== reqSeq) return;
      console.warn("[chart] load failed:", e);
      state.series = [];
      renderWhenVisible();
    }
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

  if (chartPreset) {
    chartPreset.addEventListener("change", () => {
      applyPresetValue(chartPreset.value);
    });
    applyPresetValue(chartPreset.value);
  }

  function onManualRangeEdit() {
    if (chartPreset) setPreset("custom");
    scheduleRefresh();
  }

  on(chartFrom, "input", onManualRangeEdit);
  on(chartTo, "input", onManualRangeEdit);

  on(chartFrom, "change", onManualRangeEdit);
  on(chartTo, "change", onManualRangeEdit);

  on(chartGuildId, "change", onManualRangeEdit);
  on(chartChannelId, "change", onManualRangeEdit);

  on(chartContext, "input", () => scheduleRefresh(400));
  on(chartContext, "change", onManualRangeEdit);

  if (hasTip) {
    tip.addEventListener("mouseenter", () => {
      tipHover = true;
      cancelHideTip();
      tip.classList.add("is-on");
    });

    tip.addEventListener("mouseleave", () => {
      tipHover = false;
      scheduleHideTip(HIDE_DELAY_FROM_TIP);
    });
  }

  on(canvas, "mouseleave", () => {
    state.hoverIdx = -1;
    if (hasTip && !tipHover) scheduleHideTip(HIDE_DELAY_FROM_CANVAS);
    drawChart();
  });

  on(canvas, "mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    if (tipHover) return;

    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const padL = 70, padR = 18, padT = 16, padB = 42;
    const plotW = rect.width - padL - padR;
    const plotH = rect.height - padT - padB;

    const s = state.series.filter((p) => p.ts >= state.viewMin && p.ts <= state.viewMax);
    if (!s.length) {
      state.hoverIdx = -1;
      if (hasTip && !tipHover) scheduleHideTip(HIDE_DELAY_FROM_CANVAS);
      drawChart();
      return;
    }

    const xOf = (t) => padL + ((t - state.viewMin) / (state.viewMax - state.viewMin)) * plotW;
    const yOf = (v) => padT + (1 - (v / state.yMax)) * plotH;

    let best = -1;
    let bestD = 1e18;

    for (let i = 0; i < s.length; i++) {
      const x = xOf(s[i].ts);
      const y = yOf(s[i].y);
      const d = (x - mx) * (x - mx) + (y - my) * (y - my);
      if (d < bestD) { bestD = d; best = i; }
    }

    if (best >= 0 && bestD <= 16 * 16) {
      state.hoverIdx = best;
      const px = xOf(s[best].ts);
      const py = yOf(s[best].y);
      showTooltipForPoint(s[best], px, py);
    } else {
      state.hoverIdx = -1;
      if (hasTip && !tipHover) scheduleHideTip(220);
    }

    drawChart();
  });

  on(canvas, "click", () => {
    if (state.type !== "messages") return;

    const s = state.series.filter((p) => p.ts >= state.viewMin && p.ts <= state.viewMax);
    if (state.hoverIdx < 0 || state.hoverIdx >= s.length) return;

    const point = s[state.hoverIdx];
    if (Math.round(point.y) !== 1) return;

    const url = point?.sample_url;
    if (url && typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  });

  on(tip, "click", (e) => {
    const btn = e.target.closest(".js-preview-click");
    if (!btn) return;

    const url = tipPoint?.sample_url;
    if (
      url &&
      typeof url === "string" &&
      (url.startsWith("http://") || url.startsWith("https://"))
    ) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  });

  on(canvas, "wheel", (e) => {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    const mx = (e.clientX - rect.left) / rect.width;

    const range = state.viewMax - state.viewMin;
    const zoom = Math.exp(-e.deltaY * 0.0012);
    let newRange = range / zoom;

    const minRange = 10_000;
    const maxRange = state.dataMax - state.dataMin;
    newRange = clamp(newRange, minRange, maxRange);

    const center = state.viewMin + range * mx;
    let newMin = center - newRange * mx;
    let newMax = newMin + newRange;

    if (newMin < state.dataMin) { newMin = state.dataMin; newMax = newMin + newRange; }
    if (newMax > state.dataMax) { newMax = state.dataMax; newMin = newMax - newRange; }

    state.viewMin = newMin;
    state.viewMax = newMax;

    renderWhenVisible();
    scheduleRefetchIfBucketChanged();
  }, { passive: false });

  on(canvas, "pointerdown", (e) => {
    const full = (state.dataMax - state.dataMin);
    const cur = (state.viewMax - state.viewMin);
    if (cur >= full) return;

    state.dragging = true;
    state.dragStartX = e.clientX;
    state.dragStartMin = state.viewMin;
    state.dragStartMax = state.viewMax;
    canvas.setPointerCapture(e.pointerId);
  });

  on(canvas, "pointermove", (e) => {
    if (!state.dragging) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    const dx = e.clientX - state.dragStartX;
    const dt = -(dx / rect.width) * (state.dragStartMax - state.dragStartMin);

    let newMin = state.dragStartMin + dt;
    let newMax = state.dragStartMax + dt;

    const r = newMax - newMin;
    if (newMin < state.dataMin) { newMin = state.dataMin; newMax = newMin + r; }
    if (newMax > state.dataMax) { newMax = state.dataMax; newMin = newMax - r; }

    state.viewMin = newMin;
    state.viewMax = newMax;

    renderWhenVisible();
  });

  on(canvas, "pointerup", () => { state.dragging = false; });
  on(canvas, "pointercancel", () => { state.dragging = false; });

  on(window, "resize", () => {
    if (!chartModal || chartModal.classList.contains("is-open")) renderWhenVisible();
  });

  if (chartModal) {
    const obs = new MutationObserver(() => {
      if (chartModal.classList.contains("is-open")) renderWhenVisible();
    });
    obs.observe(chartModal, { attributes: true, attributeFilter: ["class"] });
  }

  document.querySelectorAll("[data-chart-type]").forEach((el) => {
    on(el, "click", (e) => {
      e.stopPropagation();

      const t = String(el.getAttribute("data-chart-type") || "");
      const newType = t === "voice"
        ? "voice"
        : t === "activities"
        ? "activities"
        : "messages";

      if (newType === state.type) return;

      state.type = newType;
      state.viewMin = 0;
      state.viewMax = 0;

      if (hasTip) hideTip();
      scheduleRefresh(0);
    });
  });

  onLangChange(() => {
    if (chartSum) chartSum.textContent = summaryText();
    if (state.series.length) renderWhenVisible();
  });

  scheduleRefresh(0);

  return {
    refresh: () => scheduleRefresh(0),
    setType: (t) => {
      state.type = t === "voice" ? "voice" : t === "activities" ? "activities" : "messages";
      state.viewMin = 0;
      state.viewMax = 0;
      if (hasTip) hideTip();
      scheduleRefresh(0);
    }
  };
}
