import { clamp } from "@/lib/index.js";
import { isMousePointerEvent } from "./chart-utils.js";
import { resolveType } from "./chart-types.js";

export function attachInteractions(canvas, state, tooltip, drawer, onBucketChanged) {
  const { hideTip, scheduleHideTip, showTooltipForPoint, getTipHover, hasTip, HIDE_DELAY_FROM_CANVAS, HIDE_DELAY_FROM_TIP } = tooltip;
  const { drawChart, findNearestPoint, renderWhenVisible } = drawer;

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

  function canHover() {
    return hoverMq.matches;
  }

  function getRangeLimits() {
    const fullRange = Math.max(1, state.dataMax - state.dataMin);
    return {
      minRange: Math.min(10_000, fullRange),
      maxRange: fullRange
    };
  }

  function clampView(newMin, newMax) {
    const fullMin = state.dataMin;
    const fullMax = state.dataMax;
    const fullRange = fullMax - fullMin;
    const range = newMax - newMin;

    if (range >= fullRange) return { min: fullMin, max: fullMax };

    let min = newMin;
    let max = newMax;

    if (min < fullMin) { min = fullMin; max = min + range; }
    if (max > fullMax) { max = fullMax; min = max - range; }

    return { min, max };
  }

  function panFromStart(dxPx, widthPx, startMin, startMax) {
    const dt = -(dxPx / Math.max(1, widthPx)) * (startMax - startMin);
    const next = clampView(startMin + dt, startMax + dt);
    state.viewMin = next.min;
    state.viewMax = next.max;
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

  function getTouchDistance(a, b) {
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }

  function getTouchCenter(a, b) {
    return {
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2
    };
  }

  function on(el, event, handler, opts) {
    if (!el) return;
    el.addEventListener(event, handler, opts);
  }

  canvas.style.touchAction = "none";

  on(canvas, "mouseleave", () => {
    if (!canHover()) return;
    state.hoverIdx = -1;
    if (hasTip && !getTipHover()) scheduleHideTip(HIDE_DELAY_FROM_CANVAS);
    drawChart();
  });

  on(canvas, "mousemove", (e) => {
    if (!canHover() || getTipHover() || state.dragging) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    const hit = findNearestPoint(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      8
    );

    if (hit) {
      state.hoverIdx = hit.idx;
      showTooltipForPoint(hit.point, hit.px, hit.py);
    } else {
      state.hoverIdx = -1;
      if (hasTip && !getTipHover()) scheduleHideTip(HIDE_DELAY_FROM_TIP);
    }

    drawChart();
  });

  on(canvas, "click", () => {
    if (!canHover()) return;
    if (Date.now() - lastTouchTs < 500) return;

    const s = state.series.filter((p) => p.ts >= state.viewMin && p.ts <= state.viewMax);
    if (state.hoverIdx < 0 || state.hoverIdx >= s.length) return;

    const point = s[state.hoverIdx];
    resolveType(state.type).onPointClick(point);
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
    onBucketChanged(260);
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
    if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  });

  on(canvas, "pointercancel", (e) => {
    if (!isMousePointerEvent(e)) return;
    state.dragging = false;
    if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
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
      onBucketChanged(0);
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

  return { getLastTouchTs: () => lastTouchTs };
}