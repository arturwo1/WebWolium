import { clamp, escapeHtml } from "@/lib/index.js";

export function niceBucketMs(rangeMs, widthPx) {
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

export function parseJsonObject(value) {
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

export function normalizeSeriesPoint(p) {
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

export function parseAttachments(raw) {
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
  } catch { }

  return [];
}

export function isImageUrl(url) {
  try {
    const { pathname } = new URL(url);
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif)$/i.test(pathname);
  } catch {
    return false;
  }
}

export function replaceImageLinksInHtml(html) {
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

export function renderAttachmentsHtml(attachments) {
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

export function isMousePointerEvent(e) {
  return !("pointerType" in e) || e.pointerType === "mouse";
}

export function getChartLayout(state, width, height) {
  const padL = state.padL ?? 70, padR = 18, padT = 16, padB = 42;
  return {
    padL,
    padR,
    padT,
    padB,
    plotW: width - padL - padR,
    plotH: height - padT - padB
  };
}

export function formatArgsInline(obj) {
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