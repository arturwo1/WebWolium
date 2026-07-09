import { clamp, formatAxisTime, formatDuration, formatNumber, formatTsFull, t } from "@/lib/index.js";
import { getChartLayout } from "./chart-utils.js";

export function makeDrawer(canvas, state) {
  const ctx = canvas.getContext("2d");
  let DPR = 1;

  const PEAK_START_RATIO = 2;
  const PEAK_FULL_RATIO = 5;

  const timeTypes = new Set(["voice", "activities"]);

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

  function visibleMain() {
    return state.series.filter((p) => p.ts >= state.viewMin && p.ts <= state.viewMax);
  }

  function visibleCompare() {
    return state.compareSeries.filter((p) => p.ts >= state.viewMin && p.ts <= state.viewMax);
  }

  function seriesDeltas(s) {
    return s.map((p, i) => (i === 0 ? 0 : p.y - s[i - 1].y));
  }

  function mean(values) {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  function formatMetricValue(v) {
    const isTimeType = [...timeTypes].some(type => state.type.includes(type));
    return isTimeType
      ? formatDuration(Math.round(v))
      : String(formatNumber(Math.round(v)));
  }

  function formatSigned(v) {
    const sign = v > 0 ? "+" : v < 0 ? "-" : "";
    return sign + formatMetricValue(Math.abs(v));
  }

  function buildModel(s, cs) {
    if (state.options.delta) {
      const mainDeltas = seriesDeltas(s);
      const compareDeltas = cs.length > 1 ? seriesDeltas(cs) : cs.map(() => 0);
      const allAbs = [...mainDeltas, ...compareDeltas].map((d) => Math.abs(d));
      const maxAbs = Math.max(1, ...allAbs) * 1.15;

      return {
        deltaMode: true,
        yMin: -maxAbs,
        yMax: maxAbs,
        mainVal: (i) => mainDeltas[i],
        compareVal: (i) => compareDeltas[i],
        avgMain: mean(mainDeltas),
        avgCompare: mean(compareDeltas),
        avgMagnitude: mean(allAbs)
      };
    }

    const mainVals = s.map((p) => p.y);
    const compareVals = cs.map((p) => p.y);
    const avgMain = mean(mainVals);

    return {
      deltaMode: false,
      yMin: 0,
      yMax: state.yMax,
      mainVal: (i) => mainVals[i],
      compareVal: (i) => compareVals[i],
      avgMain,
      avgCompare: mean(compareVals),
      avgMagnitude: avgMain
    };
  }

  function makeYOf(model, padT, plotH) {
    const span = Math.max(1e-6, model.yMax - model.yMin);
    return (v) => padT + (1 - (v - model.yMin) / span) * plotH;
  }

  function colorForModelValue(v, model, rgbPrimaryArr, rgbDndArr) {
    const basis = model.deltaMode ? Math.abs(v) : v;
    if (model.avgMagnitude <= 0 || basis <= model.avgMagnitude * PEAK_START_RATIO) return rgbPrimaryArr;
    const ratio = clamp((basis - model.avgMagnitude * PEAK_START_RATIO) / (model.avgMagnitude * (PEAK_FULL_RATIO - PEAK_START_RATIO)), 0, 1);
    return [0, 1, 2].map((k) => Math.round(rgbPrimaryArr[k] + (rgbDndArr[k] - rgbPrimaryArr[k]) * ratio));
  }

  function drawGradientLine(points, xOf, yOf, model, rgbPrimaryArr, rgbDndArr) {
    if (points.length < 2) return;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1], cur = points[i];
      const x1 = xOf(prev.ts), y1 = yOf(prev.v);
      const x2 = xOf(cur.ts), y2 = yOf(cur.v);

      const c1 = colorForModelValue(prev.v, model, rgbPrimaryArr, rgbDndArr);
      const c2 = colorForModelValue(cur.v, model, rgbPrimaryArr, rgbDndArr);

      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, `rgba(${c1.join(",")}, .9)`);
      grad.addColorStop(1, `rgba(${c2.join(",")}, .9)`);

      const cp1x = x1 + (x2 - x1) / 2, cp1y = y1;
      const cp2x = x2 - (x2 - x1) / 2, cp2y = y2;

      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawMutedLine(points, xOf, yOf, color) {
    if (points.length < 2) return;

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xOf(p.ts), y = yOf(p.v);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        const prev = points[i - 1];
        const px = xOf(prev.ts), py = yOf(prev.v);
        const cp1x = px + (x - px) / 2, cp1y = py;
        const cp2x = x - (x - px) / 2, cp2y = y;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
      }
    });
    ctx.stroke();
    ctx.restore();
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
    const rgbIdle = cssVar("--rgb-idle") || "240,178,50";
    const rgbDnd = cssVar("--rgb-dnd") || "242,63,67";

    fillRect(0, 0, W, H, `rgba(${rgbBg}, 1)`);
    strokeRect(0.5, 0.5, W - 1, H - 1, `rgba(${rgbBorder}, 1)`);

    const xOf = (ts) => state.padL + ((ts - state.viewMin) / (state.viewMax - state.viewMin)) * plotW;

    ctx.font = "12px system-ui";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = `rgba(${rgbSecondary}, 1)`;

    const s = visibleMain();

    if (!s.length) {
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `rgba(${rgbSecondary}, 1)`;
      ctx.fillText(t("chart.no_data"), W / 2, H / 2);
      return;
    }

    const cs = state.options.compare ? visibleCompare() : [];
    const model = buildModel(s, cs);
    const yOf = makeYOf(model, padT, plotH);

    const grid = 4;
    const labels = Array.from({ length: grid + 1 }, (_, i) => {
      const val = model.yMax - (model.yMax - model.yMin) * (i / grid);
      return model.deltaMode ? formatSigned(val) : formatMetricValue(val);
    });

    const maxLabelWidth = Math.max(...labels.map((l) => ctx.measureText(l).width));
    state.padL = maxLabelWidth + 12;

    for (let i = 0; i <= grid; i++) {
      const y = padT + (plotH * i) / grid;
      const a = i === grid ? 0.7 : 0.35;
      line(state.padL, y, W - padR, y, `rgba(${rgbBorder}, ${a})`);
      ctx.fillText(labels[i], state.padL - 4, y);
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

    const rgbPrimaryArr = rgbPrimary.split(",").map(Number);
    const rgbDndArr = rgbDnd.split(",").map(Number);

    if (model.deltaMode) {
      const zeroY = yOf(0);
      line(state.padL, zeroY, W - padR, zeroY, `rgba(${rgbBorder}, .8)`);
    }

    if (state.options.compare && cs.length) {
      const comparePoints = cs.map((p, i) => ({ ts: p.ts, v: model.compareVal(i) }));
      drawMutedLine(comparePoints, xOf, yOf, `rgba(${rgbSecondary}, .55)`);

      comparePoints.forEach((p, i) => {
        const x = xOf(p.ts), y = yOf(p.v);
        const kind = model.deltaMode ? "compare-delta" : "compare";
        const isHover = state.hoverKind === kind && i === state.hoverIdx;
        circle(x, y, isHover ? 4 : 2.5, `rgba(${rgbSecondary}, .9)`);
      });
    }

    const mainPoints = s.map((p, i) => ({ ts: p.ts, v: model.mainVal(i) }));
    drawGradientLine(mainPoints, xOf, yOf, model, rgbPrimaryArr, rgbDndArr);

    if (state.options.average) {
      const yMain = yOf(model.avgMain);
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = `rgba(${rgbIdle}, .9)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(state.padL, yMain);
      ctx.lineTo(W - padR, yMain);
      ctx.stroke();
      ctx.restore();

      mainPoints.forEach((p, i) => {
        const x = xOf(p.ts);
        const isHover = state.hoverKind === "average" && i === state.hoverIdx;
        circle(x, yMain, isHover ? 4 : 2.5, `rgba(${rgbIdle}, .95)`);
      });

      if (state.options.compare && cs.length) {
        const yCompare = yOf(model.avgCompare);
        ctx.save();
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = `rgba(${rgbIdle}, .5)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(state.padL, yCompare);
        ctx.lineTo(W - padR, yCompare);
        ctx.stroke();
        ctx.restore();

        cs.forEach((p, i) => {
          const x = xOf(p.ts);
          const isHover = state.hoverKind === "average-compare" && i === state.hoverIdx;
          circle(x, yCompare, isHover ? 4 : 2.5, `rgba(${rgbIdle}, .6)`);
        });
      }
    }

    mainPoints.forEach((p, i) => {
      const x = xOf(p.ts), y = yOf(p.v);
      const kind = model.deltaMode ? "delta" : "main";
      const isHover = state.hoverKind === kind && i === state.hoverIdx;
      const color = colorForModelValue(p.v, model, rgbPrimaryArr, rgbDndArr);
      circle(x, y, isHover ? 4 : 2.5, `rgba(${color.join(",")}, 1)`);
    });
  }

  function findNearestPoint(mx, my, width, height, radiusPx = 16) {
    const layout = getChartLayout(state, width, height);
    const s = visibleMain();
    if (!s.length) return null;

    const cs = state.options.compare ? visibleCompare() : [];
    const model = buildModel(s, cs);
    const yOf = makeYOf(model, layout.padT, layout.plotH);

    let best = null;
    let bestD = Infinity;

    function consider(kind, idx, ts, y, point, tooltip) {
      const x = xOfTs(ts, layout);
      const d = (x - mx) * (x - mx) + (y - my) * (y - my);
      if (d < bestD) {
        bestD = d;
        best = { kind, idx, point, px: x, py: y, tooltip };
      }
    }

    const mainKind = model.deltaMode ? "delta" : "main";

    s.forEach((p, i) => {
      const v = model.mainVal(i);
      const y = yOf(v);
      const tooltip = model.deltaMode
        ? { label: t("chart.options.delta"), valueText: formatSigned(v), timeText: formatTsFull(p.ts) }
        : null;
      consider(mainKind, i, p.ts, y, p, tooltip);
    });

    if (state.options.compare && cs.length) {
      const compareKind = model.deltaMode ? "compare-delta" : "compare";
      cs.forEach((p, i) => {
        const v = model.compareVal(i);
        const y = yOf(v);
        const tooltip = model.deltaMode
          ? { label: t("chart.options.compare"), valueText: formatSigned(v), timeText: formatTsFull(p.originalTs ?? p.ts) }
          : null;
        consider(compareKind, i, p.ts, y, p, tooltip);
      });
    }

    if (state.options.average) {
      const yMain = yOf(model.avgMain);
      s.forEach((p, i) => {
        consider("average", i, p.ts, yMain, p, {
          label: t("chart.options.average"),
          valueText: model.deltaMode ? formatSigned(model.avgMain) : formatMetricValue(model.avgMain),
          timeText: formatTsFull(p.ts)
        });
      });

      if (state.options.compare && cs.length) {
        const yCompare = yOf(model.avgCompare);
        cs.forEach((p, i) => {
          consider("average-compare", i, p.ts, yCompare, p, {
            label: t("chart.options.compare") + " · " + t("chart.options.average"),
            valueText: model.deltaMode ? formatSigned(model.avgCompare) : formatMetricValue(model.avgCompare),
            timeText: formatTsFull(p.originalTs ?? p.ts)
          });
        });
      }
    }

    if (!best || bestD > radiusPx * radiusPx) return null;
    return best;
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

    const visible = visibleMain();
    const visCompare = state.options.compare ? visibleCompare() : [];
    const ys = [...visible, ...visCompare].map((p) => p.y);
    state.yMax = (ys.length ? Math.max(1, ...ys) : 1) * 1.5;

    state.hoverIdx = -1;
    state.hoverKind = null;
    drawChart();
  }

  return { drawChart, findNearestPoint, renderWhenVisible, render };
}