import {
  $,
  clamp,
  escapeHtml,
  formatAxisTime,
  formatDiscordTime,
  formatDuration,
  formatNumber,
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

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
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
    meta: parseJsonObject(p.meta) ?? p.meta ?? null,
    sample_attachments: p.sample_attachments ?? null,
    sample_command_name: p.sample_command_name ?? null,
    sample_args: p.sample_args ?? null
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

  return [];
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

function isMousePointerEvent(e) {
  return !("pointerType" in e) || e.pointerType === "mouse";
}

function getChartLayout(width, height) {
  const padL = 70, padR = 18, padT = 16, padB = 42;
  return {
    padL,
    padR,
    padT,
    padB,
    plotW: width - padL - padR,
    plotH: height - padT - padB
  };
}

function formatArgsInline(obj) {
  return Object.entries(obj)
    .map(([key, value]) => {
      return `
        <span class="arg-pair">
          <strong class="arg-key">${escapeHtml(key)}</strong>
          <code class="arg-value">${escapeHtml(String(value))}</code>
        </span>
      `;
    })
    .join(" ");
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
  const chartCommandName = $("#chartCommandName");

  const chartVoiceMinDuration = $("#chartVoiceMinDuration");
  const chartVoiceMaxDuration = $("#chartVoiceMaxDuration");

  const chartActivityName = $("#chartActivityName");
  const chartActivityStatus = $("#chartActivityStatus");
  const chartActivityMinDuration = $("#chartActivityMinDuration");
  const chartActivityMaxDuration = $("#chartActivityMaxDuration");
  const chartActivityMore = $("#chartActivityMore");
  const chartActivityTrack = $("#chartActivityTrack");
  const chartActivityAlbum = $("#chartActivityAlbum");
  const chartActivityArtist = $("#chartActivityArtist");

  const tip = $("#chartTooltip");
  const tipTime = $("#tipTime");
  const tipVal = $("#tipVal");
  const tipPreview = $("#tipPreview");
  const hasTip = !!(tip && tipTime && tipVal && tipPreview);
  const tipHost = canvas?.closest(".chart") || document.body;

  if (!canvas || !chartFrom || !chartTo) return null;

  const ctx = canvas.getContext("2d");
  let DPR = 1;

  canvas.style.touchAction = "none";

  const hoverMq = window.matchMedia("(hover: hover) and (pointer: fine)");

  const touchState = {
    mode: null,
    startX: 0,
    startY: 0,
    startMin: 0,
    startMax: 0,
    pinchStartDist: 0,
    pinchStartCenterRatio: 0,
    pinchAnchorTs: 0,
    moved: false
  };

  let lastTouchTs = 0;

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
  const onTypeChange = typeof opts.onTypeChange === "function"
    ? opts.onTypeChange
    : null;

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
  const HIDE_DELAY_FROM_TIP = 20;

  let tipHideTimer = null;

  let activityMoreOpen = false;

  function toggleHidden(el, hidden) {
    if (el) el.hidden = !!hidden;
  }

  function syncFilterUi() {
    const isMessages = state.type === "messages";
    const isVoice = state.type === "voice";
    const isActivities = state.type === "activities";
    const isCommands = state.type === "commands";

    toggleHidden(chartGuildId, !(isMessages || isVoice || isCommands));
    toggleHidden(chartChannelId, !(isMessages || isVoice || isCommands));
    toggleHidden(chartContext, !isMessages);

    toggleHidden(chartVoiceMinDuration, !isVoice);
    toggleHidden(chartVoiceMaxDuration, !isVoice);

    toggleHidden(chartActivityName, !isActivities);
    toggleHidden(chartActivityStatus, !isActivities);
    toggleHidden(chartActivityMinDuration, !isActivities);
    toggleHidden(chartActivityMaxDuration, !isActivities);
    toggleHidden(chartActivityMore, !isActivities);

    const showAdvanced = isActivities && activityMoreOpen;
    toggleHidden(chartActivityTrack, !showAdvanced);
    toggleHidden(chartActivityAlbum, !showAdvanced);
    toggleHidden(chartActivityArtist, !showAdvanced);

    toggleHidden(chartCommandName, !isCommands);
  }

  function canHover() {
    return hoverMq.matches;
  }

  function xOfTs(ts, layout) {
    const range = Math.max(1, state.viewMax - state.viewMin);
    return layout.padL + ((ts - state.viewMin) / range) * layout.plotW;
  }

  function yOfValue(v, layout) {
    return layout.padT + (1 - (v / state.yMax)) * layout.plotH;
  }

  function clampView(newMin, newMax) {
    const fullMin = state.dataMin;
    const fullMax = state.dataMax;
    const fullRange = fullMax - fullMin;
    const range = newMax - newMin;

    if (range >= fullRange) {
      return { min: fullMin, max: fullMax };
    }

    let min = newMin;
    let max = newMax;

    if (min < fullMin) {
      min = fullMin;
      max = min + range;
    }

    if (max > fullMax) {
      max = fullMax;
      min = max - range;
    }

    return { min, max };
  }

  function panFromStart(dxPx, widthPx, startMin, startMax) {
    const dt = -(dxPx / Math.max(1, widthPx)) * (startMax - startMin);
    const next = clampView(startMin + dt, startMax + dt);
    state.viewMin = next.min;
    state.viewMax = next.max;
  }

  function getTouchDistance(a, b) {
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }

  function getTouchCenter(a, b) {
    return {
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2
    };
  }

  function getVisibleSeries() {
    return state.series.filter((p) => p.ts >= state.viewMin && p.ts <= state.viewMax);
  }

  function getRangeLimits() {
    const fullRange = Math.max(1, state.dataMax - state.dataMin);
    return {
      minRange: Math.min(10_000, fullRange),
      maxRange: fullRange
    };
  }

  function zoomFromValues(startMin, startMax, scale, centerRatio, anchorTs) {
    const startRange = Math.max(1, startMax - startMin);
    const { minRange, maxRange } = getRangeLimits();

    let newRange = startRange / Math.max(0.01, scale);
    newRange = clamp(newRange, minRange, maxRange);

    let newMin = anchorTs - newRange * centerRatio;
    let newMax = newMin + newRange;

    const next = clampView(newMin, newMax);
    state.viewMin = next.min;
    state.viewMax = next.max;
  }

  function findNearestPoint(mx, my, width, height, radiusPx = 16) {
    const s = getVisibleSeries();
    if (!s.length) return null;

    const layout = getChartLayout(width, height);

    let bestIdx = -1;
    let bestD = Infinity;

    for (let i = 0; i < s.length; i++) {
      const x = xOfTs(s[i].ts, layout);
      const y = yOfValue(s[i].y, layout);
      const d = (x - mx) * (x - mx) + (y - my) * (y - my);

      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }

    if (bestIdx < 0 || bestD > radiusPx * radiusPx) return null;

    const point = s[bestIdx];

    return {
      idx: bestIdx,
      point,
      px: xOfTs(point.ts, layout),
      py: yOfValue(point.y, layout)
    };
  }

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

  function normalizeType(type) {
    if (type === "voice") return "voice";
    if (type === "activities") return "activities";
    if (type === "commands") return "commands";
    return "messages";
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

    if (hasTip) hideTip();
    scheduleRefresh(0);
  }

  function hasSpriteSymbol(id) {
    if (!id) return false;
    return !!document.getElementById(String(id));
  }

  function statusFromCode(code) {
    const n = Number(code);
    if (n === 0) return "online";
    if (n === 1) return "idle";
    if (n === 2) return "dnd";
    if (n === 3) return "offline";
    return "";
  }

  function buildPresenceBadgeHtml(status, desktop, mobile, web) {
    const statusId = String(status || "").trim();
    if (!statusId || !hasSpriteSymbol(statusId)) return "";

    const rows = [];

    if (desktop && hasSpriteSymbol(desktop) && hasSpriteSymbol("desktop")) {
      rows.push(`
        <div class="presence-tooltip__row">
          <div class="presence-tooltip__left">
            <svg class="icon presence-tooltip__device" aria-hidden="true" viewBox="0 0 24 24">
              <use href="#desktop"></use>
            </svg>
            <span class="presence-tooltip__label">Desktop</span>
          </div>
          <svg class="icon presence-tooltip__status" aria-hidden="true" viewBox="0 0 24 24">
            <use href="#${desktop}"></use>
          </svg>
        </div>
      `);
    }

    if (mobile && hasSpriteSymbol(mobile) && hasSpriteSymbol("mobile")) {
      rows.push(`
        <div class="presence-tooltip__row">
          <div class="presence-tooltip__left">
            <svg class="icon presence-tooltip__device" aria-hidden="true" viewBox="0 0 24 24">
              <use href="#mobile"></use>
            </svg>
            <span class="presence-tooltip__label">Mobile</span>
          </div>
          <svg class="icon presence-tooltip__status" aria-hidden="true" viewBox="0 0 24 24">
            <use href="#${mobile}"></use>
          </svg>
        </div>
      `);
    }

    if (web && hasSpriteSymbol(web) && hasSpriteSymbol("web")) {
      rows.push(`
        <div class="presence-tooltip__row">
          <div class="presence-tooltip__left">
            <svg class="icon presence-tooltip__device" aria-hidden="true" viewBox="0 0 24 24">
              <use href="#web"></use>
            </svg>
            <span class="presence-tooltip__label">Web</span>
          </div>
          <svg class="icon presence-tooltip__status" aria-hidden="true" viewBox="0 0 24 24">
            <use href="#${web}"></use>
          </svg>
        </div>
      `);
    }

    return `
      <div class="presence-badge" aria-hidden="true">
        <svg class="icon" viewBox="0 0 24 24">
          <use href="#${statusId}"></use>
        </svg>
      </div>

      ${rows.length ? `
        <div class="tooltip presence-tooltip act-tip__presence-tooltip" role="tooltip" aria-hidden="true">
          <div class="presence-tooltip__list">
            ${rows.join("")}
          </div>
        </div>
      ` : ``}
    `;
  }

  function kindForType() {
    if (state.type === "voice") return "voice_series";
    if (state.type === "activities") return "activities_series";
    if (state.type === "commands") return "commands_series";
    return "messages_series";
  }

  function readPositiveInt(inputEl) {
    const raw = String(inputEl?.value ?? "").trim();
    if (!raw) return null;

    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (n < 0) return 0;

    return Math.floor(n);
  }

  function renderActivityStatusOptions() {
    if (!chartActivityStatus) return;

    const current = chartActivityStatus.value;

    const options = [
      { value: "", label: t("chart.filter.status.any") },
      { value: "online", label: t("profile.status.online") },
      { value: "idle", label: t("profile.status.idle") },
      { value: "dnd", label: t("profile.status.dnd") },
      { value: "offline", label: t("profile.status.offline") }
    ];

    chartActivityStatus.innerHTML = options.map((opt) => `
      <option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>
    `).join("");

    chartActivityStatus.value = options.some((x) => x.value === current) ? current : "";
  }

  function buildPayloadForType({ from, to, bucketMs, limit }) {
    if (state.type === "voice") {
      return {
        from,
        to,
        bucket_ms: bucketMs,
        limit,
        guild_id: chartGuildId?.value || "",
        channel_id: chartChannelId?.value || "",
        min_duration_seconds: readPositiveInt(chartVoiceMinDuration),
        max_duration_seconds: readPositiveInt(chartVoiceMaxDuration)
      };
    }

    if (state.type === "activities") {
      return {
        from,
        to,
        bucket_ms: bucketMs,
        limit,
        activity_name: chartActivityName?.value || "",
        status: chartActivityStatus?.value || "",
        min_duration_seconds: readPositiveInt(chartActivityMinDuration),
        max_duration_seconds: readPositiveInt(chartActivityMaxDuration),
        track: chartActivityTrack?.value || "",
        album: chartActivityAlbum?.value || "",
        artist: chartActivityArtist?.value || ""
      };
    }

    if (state.type === "commands") {
      return {
        from,
        to,
        bucket_ms: bucketMs,
        limit,
        guild_id: chartGuildId?.value || "",
        channel_id: chartChannelId?.value || "",
        command_name: chartCommandName?.value || ""
      };
    }

    return {
      from,
      to,
      bucket_ms: bucketMs,
      limit,
      guild_id: chartGuildId?.value || "",
      channel_id: chartChannelId?.value || "",
      context: chartContext?.value || ""
    };
  }

  function summaryText() {
    if (!state.series.length) {
      return state.type === "messages"
        ? t("chart.summary.messages", { count: 0 })
        : state.type === "voice" || state.type === "activities" ? t("chart.summary.time", { value: "00:00" })
        : t("chart.summary.commands", { count: 0 });
    }

    const sum = state.series.reduce((a, p) => a + (p.y || 0), 0);

    if (state.type === "messages") {
      return t("chart.summary.messages", { count: formatNumber(sum) });
    }

    if (state.type === "commands") {
      return t("chart.summary.commands", { count: formatNumber(sum) });
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
    const url = p?.sample_url ?? meta.url ?? null;

    const attachments = parseAttachments(p?.sample_attachments);

    const safeText = !text && attachments.length ? "" : text ? text : t("chart.preview.no_preview");

    const rawBodyHtml = renderDiscordMarkdownToHtml(safeText);
    const bodyHtml = replaceImageLinksInHtml(rawBodyHtml);
    const attachmentsHtml = renderAttachmentsHtml(attachments);

    return `
      <div class="msg-preview__bar">
        <span class="msg-preview__dot" aria-hidden="true"></span>
        <div class="msg-preview__guild" title="${escapeHtml(guildName)}">${escapeHtml(guildName)}</div>
        <div class="msg-preview__channel text-muted-sm" title="#${escapeHtml(channelName)}">${escapeHtml(channelName)}</div>
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
            <span class="msg-preview__author text-truncate">${escapeHtml(authorName)}</span>
            ${ts ? `<span class="msg-preview__time text-muted-sm">${escapeHtml(formatDiscordTime(ts))}</span>` : ``}
          </div>

          <div class="msg-preview__text md">
            ${bodyHtml}
          </div>

          ${attachmentsHtml}
        </div>
      </div>
      
      ${url && Math.round(p.y)==1 ? `
        <div class="msg-preview__hint">
          <span class="kbd js-preview-click">${t("chart.preview.click")}</span>
          <span class="msg-preview__hintText" >${t("chart.preview.discord")}</span>
        </div>
      ` : url ? `
        <div class="msg-preview__hint">
          <span class="kbd">${t("chart.preview.scroll")}</span>
          <span class="msg-preview__hintText">${t("chart.preview.scroll_down")}</span>
        </div>
      ` : `
        <div class="msg-preview__hint">
          <span class="msg-preview__hintText">${t("chart.preview.unavailable")}</span>
        </div>`}`;
    }

  function renderVoicePreview(p) {
    const meta = p?.meta ?? {};
    const guild = meta.guild_name ?? meta.guild_id ?? meta.guild ?? t("common.server");
    const chan = meta.channel_name ?? meta.channel_id ?? meta.channel ?? t("profile.voice");

    return `
      <div class="prev-voice">
        <div class="prev-voice__row">
          <span class="prev-badge">${escapeHtml(guild)}</span>
          <span class="prev-badge">${escapeHtml(chan)}</span>
        </div>
      </div>
    `;
  }

  function firstNonEmpty(...values) {
    for (const value of values) {
      if (value == null) continue;
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
    return "";
  }

  function dedupeStrings(values, { exclude = [] } = {}) {
    const seen = new Set(
      exclude
        .map((x) => String(x ?? "").trim().toLowerCase())
        .filter(Boolean)
    );

    const out = [];

    for (const value of values) {
      const normalized = String(value ?? "").trim();
      if (!normalized) continue;
      if (/^https?:\/\//i.test(normalized)) continue;

      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;

      seen.add(key);
      out.push(normalized);
    }

    return out;
  }

  function activityTypeLabel(value, sourceKind, serviceName) {
    const raw = String(value ?? "").trim();
    const service = String(serviceName ?? "").trim().toLowerCase();
    const source = Number(sourceKind);

    if (!raw) {
      if (service === "spotify" || source === 1) return "Spotify";
      return "";
    }

    const num = Number(raw);
    if (!Number.isFinite(num)) return raw;

    if (num === 0) return "Playing";
    if (num === 1) return "Streaming";
    if (num === 2) return service === "spotify" || source === 1 ? "Spotify" : "Listening";
    if (num === 3) return "Watching";
    if (num === 4) return "Custom";
    if (num === 5) return "Competing";

    return raw;
  }

  function renderActivityPreview(p) {
    const meta = parseJsonObject(p?.meta) ?? {};

    const activityDef = parseJsonObject(meta?.activity_def) ?? {};
    const presenceSnapshot = parseJsonObject(meta?.presence_snapshot) ?? {};

    const raw = parseJsonObject(activityDef?.payload) ?? {};
    const snapshot = parseJsonObject(presenceSnapshot?.payload) ?? {};

    const status = meta.status ?? snapshot.status ?? statusFromCode(presenceSnapshot?.status_code);
    const desktop = snapshot.desktop_status ?? statusFromCode(presenceSnapshot?.desktop_status_code);
    const mobile = snapshot.mobile_status ?? statusFromCode(presenceSnapshot?.mobile_status_code);
    const web = snapshot.web_status ?? statusFromCode(presenceSnapshot?.web_status_code);

    const avatar = snapshot.avatar_url ?? viewer.avatar ?? null;

    const primaryName =
      snapshot.nickname ??
      snapshot.display_name ??
      snapshot.global_name ??
      snapshot.username ??
      viewer.name ??
      "Unknown";

    const secondaryName =
      snapshot.username ??
      snapshot.global_name ??
      viewer.name ??
      "Unknown";

    const showSecondaryName =
      secondaryName &&
      String(secondaryName).trim() &&
      String(secondaryName).trim() !== String(primaryName).trim();

    const customStatus = snapshot.custom_status?.text ?? null;

    const serviceName = raw.name ?? activityDef.name ?? "Unknown";
    const sourceKind = raw.source_kind ?? activityDef.source_kind ?? meta.source_kind ?? null;
    const activityTypeValue = raw.activity_type ?? activityDef.activity_type ?? meta.activity_type ?? null;

    const isSpotify =
      String(serviceName).toLowerCase() === "spotify" ||
      Number(sourceKind) === 1 ||
      raw.spotify_track_id != null ||
      raw.spotify_track_url != null;

    const badgeLabel = isSpotify
      ? "Spotify"
      : activityTypeLabel(activityTypeValue, sourceKind, serviceName);

    const directTrack = firstNonEmpty(meta.track, raw.track, raw.song, raw.spotify_title);
    const directAlbum = firstNonEmpty(meta.album, raw.album, raw.spotify_album);
    const directArtist = firstNonEmpty(
      meta.artist,
      raw.artist,
      Array.isArray(raw.spotify_artists)
        ? raw.spotify_artists.map((x) => String(x ?? "").trim()).filter(Boolean).join(", ")
        : null
    );

    const activityName = isSpotify
      ? firstNonEmpty(directTrack, raw.details, serviceName, "Activity")
      : firstNonEmpty(meta.name, serviceName, raw.details, "Activity");

    const largeImage =
      raw.spotify_album_cover_url ??
      raw.large_image_url ??
      null;

    const smallImage =
      raw.small_image_url ??
      null;

    const artistText = directArtist;
    const albumText = directAlbum;
    const stateText = raw.state ?? null;
    const detailsText = raw.details ?? null;

    const fields = isSpotify
      ? dedupeStrings(
          [artistText, albumText],
          { exclude: [activityName, badgeLabel] }
        )
      : dedupeStrings(
          [detailsText, stateText],
          { exclude: [activityName, badgeLabel] }
        );

    const buttons = [];

    if (/^https?:\/\//i.test(String(raw.spotify_track_url ?? "").trim())) {
      buttons.push({
        href: String(raw.spotify_track_url).trim(),
        label: "Spotify"
      });
    }

    const bucketCount = p?.count ?? meta?.total_bucket_count ?? 1;
    const bucketDuration = p?.y ?? meta?.total_bucket_duration ?? 0;

    const startedAt = bucketCount > 1 && p?.bucket_start ? p.bucket_start : (meta.started_at ?? p?.bucket_start ?? p?.ts);
    const endedAt = bucketCount > 1 && p?.bucket_end ? p.bucket_end : (meta.ended_at ?? p?.bucket_end ?? p?.ts);

    const countBadge = bucketCount > 1 
      ? `<span class="act-tip__count" style="font-weight: 600; color: var(--text-muted);">${t("chart.preview.activity_count", { count: bucketCount })} &nbsp;•&nbsp; </span>` 
      : ``;

    return `
      <div class="act-tip__card">
        <div class="act-tip__user">
          <div class="act-tip__pfp-wrap">
            ${avatar
              ? `<img class="act-tip__avatar" src="${escapeHtml(avatar)}" alt="">`
              : `<div class="act-tip__avatar act-tip__avatar--fallback"></div>`}

            ${buildPresenceBadgeHtml(status, desktop, mobile, web)}
          </div>

          <div class="act-tip__names">
            <div class="act-tip__nick text-truncate" title="${escapeHtml(primaryName)}">${escapeHtml(primaryName)}</div>
            ${showSecondaryName
              ? `<div class="act-tip__dname text-truncate" title="${escapeHtml(secondaryName)}">${escapeHtml(secondaryName)}</div>`
              : ``}
          </div>

          ${customStatus
            ? `
              <div class="act-tip__cs-wrap">
                <div class="act-tip__cs is-truncated" title="${escapeHtml(customStatus)}">${escapeHtml(customStatus)}</div>
              </div>
            `
            : ``}
        </div>

        <div class="act-tip__activity">
          ${badgeLabel
            ? `
              <div class="act-tip__badges">
                <div class="act-tip__type-badge">${escapeHtml(badgeLabel)}</div>
              </div>
            `
            : ``}

          <div class="act-tip__media${largeImage ? "" : " act-tip__media--noimg"}">
            ${largeImage
              ? `
                <div class="act-tip__images">
                  <div class="act-tip__large-wrap">
                    <img
                      class="act-tip__large-img"
                      src="${escapeHtml(largeImage)}"
                      alt=""
                      loading="lazy"
                    />

                    ${smallImage
                      ? `
                        <div class="act-tip__small-wrap">
                          <img
                            class="act-tip__small-img"
                            src="${escapeHtml(smallImage)}"
                            alt=""
                            loading="lazy"
                          />
                        </div>
                      `
                      : ``}
                  </div>
                </div>
              `
              : ``}

            <div class="act-tip__info">
              <div class="act-tip__name text-truncate" title="${escapeHtml(activityName)}">${escapeHtml(activityName)}</div>

              ${fields.map((field) => `
                <div class="act-tip__field" title="${escapeHtml(field)}">${escapeHtml(field)}</div>
              `).join("")}
            </div>
          </div>

          ${buttons.length
            ? `
              <div class="act-tip__buttons">
                ${buttons.map((btn) => `
                  <a
                    class="act-tip__btn"
                    href="${escapeHtml(btn.href)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >${escapeHtml(btn.label)}</a>
                `).join("")}
              </div>
            `
            : ``}
        </div>

        <div class="act-tip__timing">
          ${escapeHtml(formatTsFull(startedAt))}
          —
          ${escapeHtml(formatTsFull(endedAt))}
          <span class="act-tip__dur">
            • ${countBadge}${escapeHtml(formatDuration(bucketDuration))}
          </span>
        </div>
      </div>
    `;
  }

  function renderCommandsPreview(p) {
    const meta = p?.meta ?? {};

    const guildName = meta.guild_name ?? t("common.server");
    const channelName = meta.channel_name ?? t("common.channel");

    const ts = meta.created_at ?? meta.timestamp ?? null;

    const authorName = viewer.name ?? t("common.user");
    const authorAvatar = viewer.avatar ?? null;

    const command_name = "/" + (p?.sample_command_name ?? "unknown");

    let raw = p?.sample_args;

    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = null;
      }
    }

    const args = (raw && typeof raw === "object" && Object.keys(raw).length > 0) ? formatArgsInline(raw) : `<span class="muted">${escapeHtml(t("common.args"))}</span>`;

    return `
      <div class="msg-preview__bar">
        <span class="msg-preview__dot" aria-hidden="true"></span>
        <div class="msg-preview__guild" title="${escapeHtml(guildName)}">${escapeHtml(guildName)}</div>
        <div class="msg-preview__channel text-muted-sm" title="#${escapeHtml(channelName)}">${escapeHtml(channelName)}</div>
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
            <span class=" text-truncate">${escapeHtml(authorName)}</span>
            ${ts ? `<span class="msg-preview__time text-muted-sm">${escapeHtml(formatDiscordTime(ts))}</span>` : ``}
          </div>

          <div class="msg-preview__text md">
            ${(raw && typeof raw === "object" && Object.keys(raw).length > 0) ? `<span class="kbd js-preview-click">${command_name}</span>` : ``}
            <span>${args}</span>
          </div>
        </div>
      </div>
      
      <div class="msg-preview__hint">
        <span class="kbd js-preview-click">${command_name}</span>
      </div>`;
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
      tipVal.textContent = `${t("profile.messages")}: ${formatNumber(p.y)}`;
      tipPreview.innerHTML = renderMessagePreview(p);
    } else if (state.type === "voice") {
      tipVal.textContent = `${t("profile.voice")}: ${formatDuration(p.y || 0)}`;
      tipPreview.innerHTML = renderVoicePreview(p);
    } else if (state.type === "activities") {
      tipVal.textContent = `${t("profile.time")}: ${formatDuration(p.y || 0)}`;
      tipPreview.innerHTML = renderActivityPreview(p);
    } else if (state.type === "commands") {
      tipVal.textContent = `${t("profile.commands")}: ${formatNumber(p.y)}`;
      tipPreview.innerHTML = renderCommandsPreview(p);
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
        ? String(formatNumber(val))
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

    const qFrom = state.viewMin;
    const qTo = state.viewMax;

    const bucketMs = niceBucketMs(qTo - qFrom, widthPx);
    state.bucketMs = bucketMs;

    const payload = buildPayloadForType({
      from: qFrom,
      to: qTo,
      bucketMs,
      limit: clamp(Math.floor(widthPx / 3), 160, 500)
    });

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

  on(chartVoiceMinDuration, "input", () => scheduleRefresh(300));
  on(chartVoiceMaxDuration, "input", () => scheduleRefresh(300));
  on(chartVoiceMinDuration, "change", onManualRangeEdit);
  on(chartVoiceMaxDuration, "change", onManualRangeEdit);

  on(chartActivityName, "input", () => scheduleRefresh(300));
  on(chartActivityName, "change", onManualRangeEdit);

  on(chartActivityStatus, "change", onManualRangeEdit);

  on(chartActivityMinDuration, "input", () => scheduleRefresh(300));
  on(chartActivityMaxDuration, "input", () => scheduleRefresh(300));
  on(chartActivityMinDuration, "change", onManualRangeEdit);
  on(chartActivityMaxDuration, "change", onManualRangeEdit);

  on(chartActivityTrack, "input", () => scheduleRefresh(300));
  on(chartActivityAlbum, "input", () => scheduleRefresh(300));
  on(chartActivityArtist, "input", () => scheduleRefresh(300));

  on(chartActivityTrack, "change", onManualRangeEdit);
  on(chartActivityAlbum, "change", onManualRangeEdit);
  on(chartActivityArtist, "change", onManualRangeEdit);

  on(chartCommandName, "input", () => scheduleRefresh(400));
  on(chartCommandName, "change", onManualRangeEdit);

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
    if (!canHover()) return;
    state.hoverIdx = -1;
    if (hasTip && !tipHover) scheduleHideTip(HIDE_DELAY_FROM_CANVAS);
    drawChart();
  });

  on(canvas, "mousemove", (e) => {
    if (!canHover() || tipHover || state.dragging) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    const hit = findNearestPoint(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      16
    );

    if (hit) {
      state.hoverIdx = hit.idx;
      showTooltipForPoint(hit.point, hit.px, hit.py);
    } else {
      state.hoverIdx = -1;
      if (hasTip && !tipHover) scheduleHideTip(HIDE_DELAY_FROM_TIP);
    }

    drawChart();
  });

  on(canvas, "click", () => {
    if (!canHover()) return;
    if (Date.now() - lastTouchTs < 500) return;
    if (state.type !== "messages") return;

    const s = getVisibleSeries();
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

    const mx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const range = state.viewMax - state.viewMin;
    const scale = Math.exp(-e.deltaY * 0.0012);
    const anchorTs = state.viewMin + range * mx;

    zoomFromValues(state.viewMin, state.viewMax, scale, mx, anchorTs);

    renderWhenVisible();
    scheduleRefetchIfBucketChanged();
  }, { passive: false });

  on(canvas, "pointerdown", (e) => {
    if (!isMousePointerEvent(e)) return;

    const full = state.dataMax - state.dataMin;
    const cur = state.viewMax - state.viewMin;
    if (cur >= full) return;

    state.dragging = true;
    state.dragStartX = e.clientX;
    state.dragStartMin = state.viewMin;
    state.dragStartMax = state.viewMax;
    canvas.setPointerCapture(e.pointerId);
  });

  on(canvas, "pointermove", (e) => {
    if (!isMousePointerEvent(e) || !state.dragging) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    const dx = e.clientX - state.dragStartX;
    panFromStart(dx, rect.width, state.dragStartMin, state.dragStartMax);

    renderWhenVisible();
  });

  on(canvas, "pointerup", (e) => {
    if (!isMousePointerEvent(e)) return;
    state.dragging = false;
    if (canvas.hasPointerCapture?.(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  });

  on(canvas, "pointercancel", (e) => {
    if (!isMousePointerEvent(e)) return;
    state.dragging = false;
    if (canvas.hasPointerCapture?.(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  });

  on(canvas, "touchstart", (e) => {
    lastTouchTs = Date.now();
    if (!e.touches.length) return;

    e.preventDefault();

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchState.mode = "pan";
      touchState.startX = touch.clientX;
      touchState.startY = touch.clientY;
      touchState.startMin = state.viewMin;
      touchState.startMax = state.viewMax;
      touchState.moved = false;
      return;
    }

    const [a, b] = e.touches;
    const rect = canvas.getBoundingClientRect();
    const center = getTouchCenter(a, b);
    const startRange = Math.max(1, state.viewMax - state.viewMin);

    touchState.mode = "pinch";
    touchState.startMin = state.viewMin;
    touchState.startMax = state.viewMax;
    touchState.pinchStartDist = Math.max(1, getTouchDistance(a, b));
    touchState.pinchStartCenterRatio = clamp((center.x - rect.left) / Math.max(1, rect.width), 0, 1);
    touchState.pinchAnchorTs = state.viewMin + startRange * touchState.pinchStartCenterRatio;
    touchState.moved = false;

    if (hasTip) hideTip();
  }, { passive: false });

  on(canvas, "touchmove", (e) => {
    lastTouchTs = Date.now();
    if (!e.touches.length) return;

    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    if (e.touches.length === 1 && touchState.mode !== "pinch") {
      const touch = e.touches[0];
      const dx = touch.clientX - touchState.startX;
      const dy = touch.clientY - touchState.startY;

      if (!touchState.moved && Math.hypot(dx, dy) >= 10) {
        touchState.moved = true;
        if (hasTip) hideTip();
      }

      if (!touchState.moved) return;

      panFromStart(dx, rect.width, touchState.startMin, touchState.startMax);
      renderWhenVisible();
      return;
    }

    if (e.touches.length >= 2) {
      const [a, b] = e.touches;
      const center = getTouchCenter(a, b);
      const dist = Math.max(1, getTouchDistance(a, b));
      const centerRatio = clamp((center.x - rect.left) / Math.max(1, rect.width), 0, 1);
      const scale = dist / Math.max(1, touchState.pinchStartDist);

      touchState.mode = "pinch";
      touchState.moved = true;

      if (hasTip) hideTip();

      zoomFromValues(
        touchState.startMin,
        touchState.startMax,
        scale,
        centerRatio,
        touchState.pinchAnchorTs
      );

      renderWhenVisible();
    }
  }, { passive: false });

  on(canvas, "touchend", (e) => {
    lastTouchTs = Date.now();
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();

    if (touchState.mode === "pinch" && e.touches.length < 2) {
      scheduleRefetchIfBucketChanged(0);
    }

    if (!e.touches.length) {
      if (touchState.mode === "pan" && !touchState.moved && e.changedTouches.length) {
        const touch = e.changedTouches[0];

        const hit = rect.width >= 10
          ? findNearestPoint(
              touch.clientX - rect.left,
              touch.clientY - rect.top,
              rect.width,
              rect.height,
              24
            )
          : null;

        if (hit) {
          state.hoverIdx = hit.idx;
          showTooltipForPoint(hit.point, hit.px, hit.py);
        } else {
          state.hoverIdx = -1;
          if (hasTip) hideTip();
        }

        drawChart();
      }

      touchState.mode = null;
      touchState.moved = false;
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchState.mode = "pan";
      touchState.startX = touch.clientX;
      touchState.startY = touch.clientY;
      touchState.startMin = state.viewMin;
      touchState.startMax = state.viewMax;
      touchState.moved = true;
      return;
    }

    if (e.touches.length >= 2) {
      const [a, b] = e.touches;
      const center = getTouchCenter(a, b);
      const startRange = Math.max(1, state.viewMax - state.viewMin);

      touchState.mode = "pinch";
      touchState.startMin = state.viewMin;
      touchState.startMax = state.viewMax;
      touchState.pinchStartDist = Math.max(1, getTouchDistance(a, b));
      touchState.pinchStartCenterRatio = clamp((center.x - rect.left) / Math.max(1, rect.width), 0, 1);
      touchState.pinchAnchorTs = state.viewMin + startRange * touchState.pinchStartCenterRatio;
      touchState.moved = true;
    }
  }, { passive: false });

  on(canvas, "touchcancel", () => {
    lastTouchTs = Date.now();
    touchState.mode = null;
    touchState.moved = false;
  }, { passive: false });

  on(window, "resize", () => {
    if (!chartModal || chartModal.classList.contains("is-open")) renderWhenVisible();
  });

  on(chartActivityMore, "click", () => {
    activityMoreOpen = !activityMoreOpen;
    syncFilterUi();
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

      const newType = String(el.getAttribute("data-chart-type") || "");
      applyType(newType);
    });
  });

  onLangChange(() => {
    renderActivityStatusOptions();
    syncFilterUi();

    if (chartSum) chartSum.textContent = summaryText();
    if (state.series.length) renderWhenVisible();
  });

  renderActivityStatusOptions();
  syncFilterUi();

  scheduleRefresh(0);

  return {
    refresh: () => scheduleRefresh(0),
    setType: (type) => {
      applyType(type);
    }
  };
}
