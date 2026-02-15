const $ = (s, r = document) => r.querySelector(s);

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function safeLink(url) {
  try {
    const u = new URL(url, window.location.href);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch { }
  return null;
}

function renderDiscordMarkdownToHtml(input) {
  const raw = String(input ?? "");
  if (!raw) return "";

  let s = escapeHtml(raw);

  const blocks = [];
  s = s.replace(/```([\s\S]*?)```/g, (_, code) => {
    const idx = blocks.length;
    blocks.push(code);
    return `\u0000BLOCK${idx}\u0000`;
  });

  const inlines = [];
  s = s.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = inlines.length;
    inlines.push(code);
    return `\u0000INLINE${idx}\u0000`;
  });

  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const safe = safeLink(url);
    if (!safe) return text;
    return `<a class="prev-link" href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  s = s.replace(/\|\|([\s\S]+?)\|\|/g, `<span class="md-spoiler">$1</span>`);

  s = s.replace(/\*\*([\s\S]+?)\*\*/g, `<strong>$1</strong>`);
  s = s.replace(/__([\s\S]+?)__/g, `<u>$1</u>`);
  s = s.replace(/~~([\s\S]+?)~~/g, `<s>$1</s>`);
  s = s.replace(/(\*|_)([^*_][\s\S]*?)\1/g, `<em>$2</em>`);

  s = s.replace(/\n/g, "<br>");

  s = s.replace(/\u0000INLINE(\d+)\u0000/g, (_, i) => {
    const code = inlines[Number(i)] ?? "";
    return `<code class="md-code">${code}</code>`;
  });

  s = s.replace(/\u0000BLOCK(\d+)\u0000/g, (_, i) => {
    const code = blocks[Number(i)] ?? "";
    return `<pre class="md-pre"><code>${code}</code></pre>`;
  });

  return s;
}

function discordMessageUrl(meta) {
  const g = meta?.guild_id;
  const c = meta?.channel_id;
  const m = meta?.message_id;
  if (g && c && m) return `https://discord.com/channels/${g}/${c}/${m}`;
  if (g && c) return `https://discord.com/channels/${g}/${c}`;
  return null;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function formatDuration(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatAxisTime(ms, rangeMs, viewMinMs, viewMaxMs) {
  const d = new Date(ms);

  const p2 = (n) => String(n).padStart(2, "0");
  const DD = p2(d.getDate());
  const hh = p2(d.getHours());
  const mm = p2(d.getMinutes());
  const ss = p2(d.getSeconds());

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MMM = months[d.getMonth()];
  const YYYY = String(d.getFullYear());

  const crossesYears = new Date(viewMinMs).getFullYear() !== new Date(viewMaxMs).getFullYear();

  if (rangeMs <= 2 * 60 * 60 * 1000) {
    return `${hh}:${mm}:${ss}`;
  }

  if (rangeMs <= 2 * 864e5) {
    return `${DD} ${MMM} ${hh}:${mm}`;
  }

  if (rangeMs <= 120 * 864e5) {
    return crossesYears ? `${DD} ${MMM} ${YYYY}` : `${DD} ${MMM}`;
  }

  if (rangeMs <= 3 * 365 * 864e5) {
    return `${MMM} ${YYYY}`;
  }

  return `${YYYY}`;
}

function formatTsFull(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function parseLocalInput(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

function toLocalDatetimeValue(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
    meta: p.meta ?? null
  };
}

export function initProfileChart(sb, queueRequest, opts = {}) {
  const canvas = $("#chartCanvas");
  const chartFrom = $("#chartFrom");
  const chartTo = $("#chartTo");
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

  function on(el, ev, fn, opt) {
    el.addEventListener(ev, fn, opt);
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
        ? "For period: 0 messages"
        : "For period: 0s";
    }

    if (state.type === "messages") {
      const sum = state.series.reduce((a, p) => a + (p.y || 0), 0);
      return `For period: ${Math.round(sum)} messages`;
    }

    const sum = state.series.reduce((a, p) => a + (p.y || 0), 0);
    return `For period: ${formatDuration(sum)}`;
  }

  function renderMessagePreview(p) {
    const meta = p?.meta ?? {};
    const guildName = meta.guild_name ?? "Server";
    const channelName = meta.channel_name ?? "channel";

    const text = String(p?.sample_content ?? "").trim();
    const url = p?.sample_url ?? null;

    const bodyHtml = (typeof renderDiscordMarkdownToHtml === "function")
      ? renderDiscordMarkdownToHtml(text || "(no preview)")
      : escapeHtml(text || "(no preview)").replace(/\n/g, "<br>");

    return `
      <div class="prev-msg">
        <div class="prev-msg__top">
          <span class="prev-dot" aria-hidden="true"></span>
          <div class="prev-title">${escapeHtml(guildName)}</div>
          <div class="prev-sub">#${escapeHtml(channelName)}</div>
        </div>

        <div class="prev-body md">
          ${bodyHtml}
        </div>

        ${url ? `
          <div class="prev-hint">
            <span class="prev-hint__kbd">Click</span>
            <span class="prev-hint__text">Open in Discord</span>
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderVoicePreview(p) {
    const meta = p?.meta ?? {};
    const guild = meta.guild_id ?? meta.guild ?? "Server";
    const chan = meta.channel_id ?? meta.channel ?? "Voice";
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
    const name = meta.name ?? meta.activity ?? "Activity";
    return `
      <div class="prev-act">
        <div class="prev-body">${escapeHtml(name)}</div>
      </div>
    `;
  }

  function hideTip() {
    if (!hasTip) return;
    tip.classList.remove("is-on");
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
      tipVal.textContent = `Messages: ${Math.round(p.y)}`;
      tipPreview.innerHTML = renderMessagePreview(p);
    } else if (state.type === "voice") {
      tipVal.textContent = `Time: ${formatDuration(p.y || 0)}`;
      tipPreview.innerHTML = renderVoicePreview(p);
    } else {
      tipVal.textContent = `Time: ${formatDuration(p.y || 0)}`;
      tipPreview.innerHTML = renderActivityPreview(p);
    }

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
      ctx.fillText("No data for selected range", W / 2, H / 2);
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
      limit: clamp(Math.floor(widthPx / 3), 160, 500)
    };

    try {
      const rows = await queueRequest(sb, kindForType(), payload, reqOpts);
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

    const p = s[state.hoverIdx];

    if (Math.round(p.y) !== 1) return;

    const url = p?.sample_url;
    if (url && typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
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
    on(el, "click", () => {
      const t = String(el.getAttribute("data-chart-type") || "");
      state.type = t === "voice" ? "voice" : t === "activities" ? "activities" : "messages";
      state.viewMin = 0;
      state.viewMax = 0;
      if (hasTip) hideTip();
      scheduleRefresh(0);
    });
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
