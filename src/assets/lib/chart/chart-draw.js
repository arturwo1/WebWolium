import { formatAxisTime, formatDuration, formatNumber, t } from "@/lib/index.js";
import { getChartLayout } from "./chart-utils.js";

export function makeDrawer(canvas, state) {
  const ctx = canvas.getContext("2d");
  let DPR = 1;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function fillRect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function strokeRect(x, y, w, h, c) { ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h); }
  function line(x1, y1, x2, y2, c) { ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function circle(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

  function xOfTs(ts, layout) {
    const range = Math.max(1, state.viewMax - state.viewMin);
    return layout.padL + ((ts - state.viewMin) / range) * layout.plotW;
  }

  function yOfValue(v, layout) {
    return layout.padT + (1 - (v / state.yMax)) * layout.plotH;
  }

  function drawChart() {
    DPR = Math.max(1, window.devicePixelRatio || 1);

    const W = canvas.width / DPR;
    const H = canvas.height / DPR;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const padR = 18, padT = 16, padB = 42;
    const plotW = W - state.padL - padR;
    const plotH = H - padT - padB;

    const rgbBg = cssVar("--rgb-bg") || "35,39,42";
    const rgbBorder = cssVar("--rgb-border") || "43,49,55";
    const rgbPrimary = cssVar("--rgb-primary") || "128,224,245";
    const rgbSecondary = cssVar("--rgb-secondary") || "173,176,179";

    fillRect(0, 0, W, H, `rgba(${rgbBg}, 1)`);
    strokeRect(0.5, 0.5, W - 1, H - 1, `rgba(${rgbBorder}, 1)`);

    const xOf = (ts) => state.padL + ((ts - state.viewMin) / (state.viewMax - state.viewMin)) * plotW;
    const yOf = (v) => padT + (1 - (v / state.yMax)) * plotH;

    const grid = 4;
    ctx.font = "12px system-ui";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = `rgba(${rgbSecondary}, 1)`;

    const s = state.series.filter((p) => p.ts >= state.viewMin && p.ts <= state.viewMax);

    if (!s.length) {
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `rgba(${rgbSecondary}, 1)`;
      ctx.fillText(t("chart.no_data"), W / 2, H / 2);
      return;
    }

    const timeTypes = new Set(["voice", "activities"]);

    const labels = Array.from({ length: grid + 1 }, (_, i) => {
      const val = state.yMax * (1 - i / grid);
      return timeTypes.has(state.type)
        ? formatDuration(Math.round(val))
        : String(formatNumber(Math.round(val)));
    });

    const maxLabelWidth = Math.max(...labels.map(l => ctx.measureText(l).width));
    state.padL = maxLabelWidth + 12;

    for (let i = 0; i <= grid; i++) {
      const y = padT + (plotH * i) / grid;
      const a = i === grid ? 0.7 : 0.35;
      line(state.padL, y, W - padR, y, `rgba(${rgbBorder}, ${a})`);

      const val = state.yMax * (1 - i / grid);
      const label = !timeTypes.has(state.type)
        ? String(formatNumber(Math.round(val)))
        : formatDuration(Math.round(val));

      ctx.fillText(label, state.padL - 4, y);
    }

    const rangeMs = state.viewMax - state.viewMin;
    const xTicks = rangeMs > 3 * 365 * 864e5 ? 6 : rangeMs > 120 * 864e5 ? 5 : 4;

    ctx.textBaseline = "top";
    ctx.fillStyle = `rgba(${rgbSecondary}, 1)`;

    for (let i = 0; i <= xTicks; i++) {
      const ts = state.viewMin + (rangeMs * i) / xTicks;
      const rawX = state.padL + (plotW * i) / xTicks;
      const label = formatAxisTime(ts, rangeMs, state.viewMin, state.viewMax);

      if (i === 0) ctx.textAlign = "left";
      else if (i === xTicks) ctx.textAlign = "right";
      else ctx.textAlign = "center";

      let x = rawX;
      if (i === 0) x = rawX + 2;
      if (i === xTicks) x = rawX - 2;

      line(rawX, padT + plotH, rawX, padT + plotH + 6, `rgba(${rgbBorder}, .8)`);
      ctx.fillText(label, x, padT + plotH + 10);
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(${rgbPrimary}, .9)`;
    ctx.beginPath();
    s.forEach((p, i) => {
      const x = xOf(p.ts);
      const y = yOf(p.y);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        const prev = s[i - 1];
        const px = xOf(prev.ts);
        const py = yOf(prev.y);
        const cp1x = px + (x - px) / 2;
        const cp1y = py;
        const cp2x = x - (x - px) / 2;
        const cp2y = y;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
      }
    });
    ctx.stroke();

    s.forEach((p, i) => {
      const x = xOf(p.ts);
      const y = yOf(p.y);
      const r = (i === state.hoverIdx) ? 4 : 2.5;
      circle(x, y, r, `rgba(${rgbPrimary}, 1)`);
    });
  }

  function findNearestPoint(mx, my, width, height, radiusPx = 16) {
    const s = state.series.filter((p) => p.ts >= state.viewMin && p.ts <= state.viewMax);
    if (!s.length) return null;

    const layout = getChartLayout(state, width, height);

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

  function renderWhenVisible(tries = 90) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width >= 10 && rect.height >= 10) {
      render();
      return;
    }
    if (tries <= 0) return;
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

    state.hoverIdx = -1;
    drawChart();
  }

  return { drawChart, findNearestPoint, renderWhenVisible, render };
}