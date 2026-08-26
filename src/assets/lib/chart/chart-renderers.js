import { escapeHtml, formatDiscordTime, formatDuration, formatNumber, formatTsFull, t, renderDiscordMarkdownToHtml } from "@/lib/index.js";
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

function resolveGuildChannel(meta, fallbacks = {}) {
  const guildName = firstNonEmpty(meta?.guild_name, meta?.guild_id, meta?.guild) || fallbacks.guild || "";
  const channelName = firstNonEmpty(meta?.channel_name, meta?.channel_id, meta?.channel) || fallbacks.channel || "";
  return { guildName, channelName };
}

function renderSourceBar(guildName, channelName) {
  if (!guildName && !channelName) return "";

  return `
    <div class="msg-preview__bar">
      <span class="msg-preview__dot" aria-hidden="true"></span>
      ${guildName ? `<div class="msg-preview__guild" title="${escapeHtml(guildName)}">${escapeHtml(guildName)}</div>` : ""}
      ${channelName ? `<div class="msg-preview__channel text-muted-sm" title="#${escapeHtml(channelName)}">${escapeHtml(channelName)}</div>` : ""}
    </div>
  `;
}

function renderTimingFooter({ start, end, count = null, duration = null, buttons = [], badgeLabel = null }) {
  const durationParts = [];

  if (count && count > 1) {
    durationParts.push(`<span class="act-tip__count">${escapeHtml(t("chart.preview.activity_count", { count }))}</span>`);
  }

  if (duration != null) {
    durationParts.push(escapeHtml(formatDuration(duration)));
  }

  return `
    <div class="act-tip__timing">
      ${buttons.length
      ? `
        <div class="act-tip__buttons">
          ${buttons.map((btn) => `
            <a class="act-tip__btn" href="${escapeHtml(btn.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(btn.label)}</a>
          `).join("")}
        </div>
      `
      : badgeLabel
        ? `
        <div class="act-tip__badges">
          <div class="act-tip__type-badge">${escapeHtml(badgeLabel)}</div>
        </div>
      `
        : ``}
      ${start ? escapeHtml(formatTsFull(start)) : ""}
      ${start && end ? "—" : ""}
      ${end ? escapeHtml(formatTsFull(end)) : ""}
      ${durationParts.length ? `<span class="act-tip__dur">• ${durationParts.join(" • ")}</span>` : ""}
    </div>
  `;
}

function renderActivityBlock({ image = null, smallImage = null, name = null, fields = [] }) {
  const hasMedia = !!(image || name || fields.length);

  if (!hasMedia) return "";

  return `
    <div class="act-tip__activity">
      ${hasMedia ? `
        <div class="act-tip__media${image ? "" : " act-tip__media--noimg"}">
          ${image ? `
            <div class="act-tip__images">
              <div class="act-tip__large-wrap">
                <img class="act-tip__large-img" src="${escapeHtml(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">

                ${smallImage ? `
                  <div class="act-tip__small-wrap">
                    <img class="act-tip__small-img" src="${escapeHtml(smallImage)}" alt="" loading="lazy">
                  </div>
                ` : ""}
              </div>
            </div>
          ` : ""}

          <div class="act-tip__info">
            ${name ? `<div class="act-tip__name text-truncate" title="${escapeHtml(String(name))}">${escapeHtml(String(name))}</div>` : ""}
            ${fields.map((field) => `<div class="act-tip__field" title="${escapeHtml(field)}">${escapeHtml(field)}</div>`).join("")}
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function renderStatCard({ guildName = "", channelName = "", image = null, smallImage = null, name = null, fields = [], start = null, end = null, count = null, duration = null }) {
  return `
    <div class="act-tip__card">
      ${renderSourceBar(guildName, channelName)}
      ${renderActivityBlock({ image, smallImage, name, fields })}
      ${renderTimingFooter({ start, end, count, duration })}
    </div>
  `;
}

function renderGuildBucketStat(p, { useTsFallback = false } = {}) {
  const meta = p?.meta ?? {};
  const { guildName, channelName } = resolveGuildChannel(meta);

  return renderStatCard({
    guildName,
    channelName,
    start: p?.bucket?.start ?? (useTsFallback ? p?.ts ?? null : null),
    end: p?.bucket?.end ?? null,
    count: p?.count ?? meta?.total_bucket_count ?? null
  });
}

export function renderUserMessagePreview(p, viewer) {
  const meta = p?.meta ?? {};

  const { guildName, channelName } = resolveGuildChannel(meta, { guild: t("common.server"), channel: t("common.channel") });
  const ts = meta.created_at ?? meta.timestamp ?? null;
  const authorName = viewer.name ?? t("common.user");
  const authorAvatar = viewer.avatar ?? null;

  const text = String(p?.sample_content ?? "").trim();
  const url = p?.sample_url ?? meta.url ?? null;
  const attachments = parseAttachments(p?.sample_attachments);
  const safeText = !text && attachments.length ? "" : text ? text : t("chart.preview.no_preview");
  const bodyHtml = replaceImageLinksInHtml(renderDiscordMarkdownToHtml(safeText));
  const attachmentsHtml = renderAttachmentsHtml(attachments);

  return `
    ${renderSourceBar(guildName, channelName)}

    <div class="msg-preview__row">
      <div class="msg-preview__avatar" aria-hidden="true">
        ${authorAvatar
      ? `<img class="msg-preview__avatarImg" src="${escapeHtml(authorAvatar)}" alt="" loading="lazy"/>`
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

    ${url && Math.round(p.y) === 1 ? `
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

export function renderUserVoicePreview(p) {
  const meta = p?.meta ?? {};

  const guildName = firstNonEmpty(meta.guild_name, meta.guild_id) || t("common.server");

  const beforeChannelName = firstNonEmpty(meta.before_channel_name, meta.before_channel_id);
  const afterChannelName = firstNonEmpty(meta.after_channel_name, meta.after_channel_id);

  const bucketCount = p?.count ?? meta?.total_bucket_count ?? 1;
  const isBucket = bucketCount > 1;

  const distinctChannels = meta?.distinct_channels_in_bucket ?? null;
  const jumps = meta?.jumps_in_bucket ?? 0;

  let channelName;
  let badgeLabel = null;

  if (isBucket && distinctChannels > 1) {
    channelName = t("chart.preview.channels_count", { count: distinctChannels });
    if (jumps > 0) badgeLabel = t("chart.preview.jumps_count", { count: jumps });
  } else if (!isBucket && afterChannelName && afterChannelName !== beforeChannelName) {
    channelName = `${beforeChannelName} → ${afterChannelName}`;
  } else {
    channelName = beforeChannelName || afterChannelName || t("common.channel");
  }

  const start = isBucket
    ? (p?.bucket?.start ?? null)
    : (meta.started_at_ms ?? p?.bucket?.start ?? null);
  const end = isBucket
    ? (p?.bucket?.end ?? null)
    : (meta.ended_at_ms ?? p?.bucket?.end ?? null);
  const duration = isBucket
    ? (p?.y ?? meta.total_bucket_duration ?? null)
    : (meta.duration_seconds ?? p?.y ?? null);

  const channelUrl = firstNonEmpty(meta.after_channel_url, meta.before_channel_url);

  return `
    ${renderSourceBar(guildName, channelName)}
    ${renderTimingFooter({ start, end, count: bucketCount, duration, badgeLabel })}

    ${channelUrl && !isBucket ? `
      <div class="msg-preview__hint">
        <span class="kbd js-preview-click">${t("chart.preview.click")}</span>
        <span class="msg-preview__hintText">${t("chart.preview.discord")}</span>
      </div>
    ` : channelUrl ? `
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

export function renderUserActivityPreview(p, viewer) {
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

  const largeImage = raw.spotify_album_cover_url ?? raw.large_image_url ?? null;
  const smallImage = raw.small_image_url ?? null;

  const fields = isSpotify
    ? dedupeStrings([directArtist, directAlbum], { exclude: [activityName, badgeLabel] })
    : dedupeStrings([raw.details ?? null, raw.state ?? null], { exclude: [activityName, badgeLabel] });

  const buttons = [];

  if (/^https?:\/\//i.test(String(raw.spotify_track_url ?? "").trim())) {
    buttons.push({
      href: String(raw.spotify_track_url).trim(),
      label: "Spotify"
    });
  }

  const bucketCount = p?.count ?? meta?.total_bucket_count ?? 1;
  const bucketDuration = p?.y ?? meta?.total_bucket_duration ?? 0;

  const bucketStart = p?.bucket?.start ?? null;
  const bucketEnd = p?.bucket?.end ?? null;

  const startedAt = bucketCount > 1 ? (bucketStart ?? p?.ts) : (meta.started_at ?? bucketStart ?? p?.ts);
  const endedAt = bucketCount > 1 ? (bucketEnd ?? p?.ts) : (meta.ended_at ?? bucketEnd ?? p?.ts);

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

      ${renderActivityBlock({ image: largeImage, smallImage, name: activityName, fields })}

      ${renderTimingFooter({ start: startedAt, end: endedAt, count: bucketCount, duration: bucketDuration, buttons, badgeLabel })}
    </div>
  `;
}

export function renderUserCommandsPreview(p, viewer) {
  const meta = p?.meta ?? {};
  const { guildName, channelName } = resolveGuildChannel(meta, { guild: t("common.server"), channel: t("common.channel") });

  const ts = meta.created_at ?? meta.timestamp ?? null;
  const authorName = viewer.name ?? t("common.user");
  const authorAvatar = viewer.avatar ?? null;
  const commandName = "/" + (p?.sample_command_name ?? "unknown");

  let rawArgs = p?.sample_args;

  if (typeof rawArgs === "string") {
    try {
      rawArgs = JSON.parse(rawArgs);
    } catch {
      rawArgs = null;
    }
  }

  const hasArgs = rawArgs && typeof rawArgs === "object" && Object.keys(rawArgs).length > 0;
  const args = hasArgs
    ? formatArgsInline(rawArgs)
    : `<span class="muted">${escapeHtml(t("common.args"))}</span>`;

  return `
    ${renderSourceBar(guildName, channelName)}

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
          ${hasArgs ? `<span class="kbd js-preview-click">${commandName}</span>` : ``}
          <span>${args}</span>
        </div>
      </div>
    </div>

    <div class="msg-preview__hint">
      <span class="kbd js-preview-click">${commandName}</span>
    </div>
  `;
}

export function renderGuildMessagePreview(p) {
  return renderGuildBucketStat(p);
}

export function renderGuildVoicePreview(p) {
  const meta = p?.meta ?? {};

  const guildName = firstNonEmpty(meta.guild_name, meta.guild_id) || t("common.server");

  const beforeChannelName = firstNonEmpty(meta.before_channel_name, meta.before_channel_id);
  const afterChannelName = firstNonEmpty(meta.after_channel_name, meta.after_channel_id);

  const bucketCount = p?.count ?? meta?.total_bucket_count ?? 1;
  const isBucket = bucketCount > 1;

  const distinctChannels = meta?.distinct_channels_in_bucket ?? null;
  const jumps = meta?.jumps_in_bucket ?? 0;

  let channelName;
  let badgeLabel = null;

  if (isBucket && distinctChannels > 1) {
    channelName = t("chart.preview.channels_count", { count: distinctChannels });
    if (jumps > 0) badgeLabel = t("chart.preview.jumps_count", { count: jumps });
  } else if (!isBucket && afterChannelName && afterChannelName !== beforeChannelName) {
    channelName = `${beforeChannelName} → ${afterChannelName}`;
  } else {
    channelName = beforeChannelName || afterChannelName || t("common.channel");
  }

  const start = isBucket
    ? (p?.bucket?.start ?? null)
    : (meta.started_at_ms ?? p?.bucket?.start ?? null);
  const end = isBucket
    ? (p?.bucket?.end ?? null)
    : (meta.ended_at_ms ?? p?.bucket?.end ?? null);
  const duration = isBucket
    ? (p?.y ?? meta.total_bucket_duration ?? null)
    : (meta.duration_seconds ?? p?.y ?? null);

  const channelUrl = firstNonEmpty(meta.after_channel_url, meta.before_channel_url);

  return `
    ${renderSourceBar(guildName, channelName)}
    ${renderTimingFooter({ start, end, count: bucketCount, duration, badgeLabel })}

    ${channelUrl && !isBucket ? `
      <div class="msg-preview__hint">
        <span class="kbd js-preview-click">${t("chart.preview.click")}</span>
        <span class="msg-preview__hintText">${t("chart.preview.discord")}</span>
      </div>
    ` : channelUrl ? `
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

export function renderGuildActivityPreview(p) {
  const meta = p?.meta ?? {};

  return renderStatCard({
    image: meta.activity_icon ?? null,
    name: meta.activity_name ?? t("chart.preview.no_preview"),
    start: p?.bucket?.start ?? null,
    end: p?.bucket?.end ?? null,
    duration: p?.y || 0,
    count: p?.count ?? meta?.total_bucket_count ?? null
  });
}

export function renderGuildMembersPreview(p) {
  return renderGuildBucketStat(p, { useTsFallback: true });
}