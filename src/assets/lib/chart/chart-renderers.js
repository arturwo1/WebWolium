import { escapeHtml, formatDiscordTime, formatDuration, formatTsFull, t, renderDiscordMarkdownToHtml } from "@/lib/index.js";
import { parseJsonObject, parseAttachments, renderAttachmentsHtml, replaceImageLinksInHtml, formatArgsInline } from "./chart-utils.js";

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

export function renderMessagePreview(p, viewer) {
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

    ${url && Math.round(p.y) == 1 ? `
      <div class="msg-preview__hint">
        <span class="kbd js-preview-click">${t("chart.preview.click")}</span>
        <span class="msg-preview__hintText">${t("chart.preview.discord")}</span>
      </div>
    ` : url ? `
      <div class="msg-preview__hint">
        <span class="kbd">${t("chart.preview.scroll")}</span>
        <span class="msg-preview__hintText">${t("chart.preview.scroll_down")}</span>
      </div>
    ` : `
      <div class="msg-preview__hint">
        <span class="msg-preview__hintText">${t("chart.preview.unavailable")}</span>
      </div>`}
  `;
}

export function renderVoicePreview(p) {
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

export function renderActivityPreview(p, viewer) {
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

export function renderCommandsPreview(p, viewer) {
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

  const args = (raw && typeof raw === "object" && Object.keys(raw).length > 0)
    ? formatArgsInline(raw)
    : `<span class="muted">${escapeHtml(t("common.args"))}</span>`;

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
          <span class="text-truncate">${escapeHtml(authorName)}</span>
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
    </div>
  `;
}