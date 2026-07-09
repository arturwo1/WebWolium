import { clamp, formatTsFull } from "@/lib/index.js";
import { resolveType } from "./chart-types.js";

export function makeTooltip(tip, tipTime, tipVal, tipPreview, canvas, state, viewer) {
  const hasTip = !!(tip && tipTime && tipVal && tipPreview);
  const tipHost = canvas?.closest(".chart") || document.body;

  let tipHover = false;
  let tipPoint = null;
  let tipHideTimer = null;

  const HIDE_DELAY_FROM_CANVAS = 0;
  const HIDE_DELAY_FROM_TIP = 20;

  function cancelHideTip() {
    if (tipHideTimer) clearTimeout(tipHideTimer);
    tipHideTimer = null;
  }

  function scheduleHideTip(ms = 180) {
    if (!hasTip) return;
    if (tipHideTimer) clearTimeout(tipHideTimer);
    tipHideTimer = setTimeout(() => {
      tipHideTimer = null;
      if (!tipHover) tip.classList.remove("is-on");
    }, ms);
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

    const typeDef = resolveType(state.type);
    tipVal.textContent = typeDef.tipVal(p);
    tipPreview.innerHTML = typeDef.renderPreview(p, viewer);

    tipPoint = p;
    requestAnimationFrame(() => placeTooltipAtPoint(px, py));
  }

  function showSimpleTooltip(label, valueText, timeText, p, px, py) {
    if (!hasTip) return;

    tip.classList.add("is-on");
    cancelHideTip();

    tipTime.textContent = timeText;
    tipVal.textContent = `${label}: ${valueText}`;
    tipPreview.innerHTML = "";

    tipPoint = p;
    requestAnimationFrame(() => placeTooltipAtPoint(px, py));
  }

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

    tip.addEventListener("click", (e) => {
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
  }

  return {
    hasTip,
    hideTip,
    scheduleHideTip,
    cancelHideTip,
    showTooltipForPoint,
    showSimpleTooltip,
    getTipHover: () => tipHover,
    HIDE_DELAY_FROM_CANVAS,
    HIDE_DELAY_FROM_TIP
  };
}