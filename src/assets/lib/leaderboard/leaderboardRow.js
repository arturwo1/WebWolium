export const METRICS = [
  { key: "total_balance", i18nKey: "leaderboard.metric_total_balance", format: "sparks" },
  { key: "bank_balance", i18nKey: "leaderboard.metric_bank_balance", format: "sparks" },
  { key: "balance", i18nKey: "leaderboard.metric_balance", format: "sparks" },
  { key: "upgrade", i18nKey: "leaderboard.metric_upgrade", format: "number" },
  { key: "total_xp", i18nKey: "leaderboard.metric_total_xp", format: "number" },
  { key: "level", i18nKey: "leaderboard.metric_level", format: "number" },
  { key: "experience", i18nKey: "leaderboard.metric_experience", format: "number" },
  { key: "message_count", i18nKey: "leaderboard.metric_message_count", format: "number" },
  { key: "voice_time", i18nKey: "leaderboard.metric_voice_time", format: "time" },
  { key: "votes", i18nKey: "leaderboard.metric_votes", format: "number" },
  { key: "streak_votes", i18nKey: "leaderboard.metric_streak_votes", format: "number" },
  { key: "activity_time", i18nKey: "leaderboard.metric_activity_time", format: "time" },
  { key: "commands", i18nKey: "leaderboard.metric_commands", format: "number" },
];

export const METRICS_MAP = Object.fromEntries(METRICS.map(m => [m.key, m]));

export function fmtValue(value, metricKey, formatters) {
  const m = METRICS_MAP[metricKey];
  if (m?.format === "sparks") return formatters.number(value ?? 0) + "₩";
  if (m?.format === "number") return formatters.number(value ?? 0);
  if (m?.format === "time") return formatters.duration(value ?? 0);
  return formatters.number(value ?? 0);
}

export function rankBadge(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

export function rankClass(rank) {
  if (rank === 1) return "lb-row--gold";
  if (rank === 2) return "lb-row--silver";
  if (rank === 3) return "lb-row--bronze";
  return "";
}

function buildAvatar(src, name) {
  if (src) {
    const img = document.createElement("img");
    img.className = "lb-row__avatar";
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    return img;
  }
  const fallback = document.createElement("span");
  fallback.className = "lb-row__avatar lb-row__avatar--fallback";
  fallback.textContent = (name ?? "?")[0].toUpperCase();
  return fallback;
}

export function buildRow(entry, { isSelf = false, isServerScope = false, metricKey, interactive = true }, translate, formatters) {
  const row = document.createElement("div");
  row.className = [
    "lb-row",
    rankClass(entry.rank),
    isSelf ? "lb-row--own" : "",
    (interactive && !isSelf && !isServerScope && entry.user_id) ? "lb-row--link" : "",
  ].filter(Boolean).join(" ");

  const rankEl = document.createElement("span");
  rankEl.className = "lb-row__rank";
  rankEl.textContent = rankBadge(entry.rank);

  const nameEl = document.createElement("span");
  nameEl.className = "lb-row__name";

  if (isServerScope) {
    nameEl.appendChild(buildAvatar(entry.icon ?? null, entry.guild_name));
    const label = document.createElement("span");
    label.className = "lb-row__display text-truncate";
    label.textContent = entry.guild_name ?? translate("leaderboard.unknown");
    nameEl.appendChild(label);
  } else {
    nameEl.appendChild(buildAvatar(entry.avatar ?? null, entry.display_name));
    const label = document.createElement("span");
    label.className = "lb-row__display text-truncate";
    label.textContent = entry.display_name ?? translate("leaderboard.unknown");
    nameEl.appendChild(label);

    if (interactive && !isSelf && entry.user_id) {
      const href = `/profile/?user_id=${entry.user_id}`;
      row.setAttribute("role", "link");
      row.setAttribute("tabindex", "0");
      row.title = entry.display_name ?? "";
      row.addEventListener("click", () => { window.location.href = href; });
      row.addEventListener("keydown", e => { if (e.key === "Enter") window.location.href = href; });
    }
  }

  const valueEl = document.createElement("span");
  valueEl.className = "lb-row__value";
  valueEl.textContent = fmtValue(entry.value, metricKey, formatters);

  row.append(rankEl, nameEl, valueEl);
  return row;
}