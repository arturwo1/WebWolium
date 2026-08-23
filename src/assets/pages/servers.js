import { $, hud, t } from "@/lib/index.js";
import { discordApiFetch } from "@/lib/auth/discordProviderToken.js";
import { createServerListController } from "@/lib/servers/serverListController.js";

const PERMISSIONS = Object.freeze({
  CREATE_INSTANT_INVITE: 0x00000001n,
  KICK_MEMBERS: 0x00000002n,
  BAN_MEMBERS: 0x00000004n,
  ADMINISTRATOR: 0x00000008n,
  MANAGE_CHANNELS: 0x00000010n,
  MANAGE_GUILD: 0x00000020n,
  VIEW_AUDIT_LOG: 0x00000080n,
  VIEW_GUILD_INSIGHTS: 0x00080000n,
  MUTE_MEMBERS: 0x00400000n,
  DEAFEN_MEMBERS: 0x00800000n,
  MOVE_MEMBERS: 0x01000000n,
  MANAGE_NICKNAMES: 0x08000000n,
  MANAGE_ROLES: 0x10000000n,
  MANAGE_WEBHOOKS: 0x20000000n,
  MANAGE_MESSAGES: 0x00002000n,
  MANAGE_EVENTS: 0x2000000000n,
  MODERATE_MEMBERS: 0x10000000000n,
});

const IMPORTANT_PERMISSIONS = Object.freeze([
  { id: "manage_guild", bit: PERMISSIONS.MANAGE_GUILD, key: "servers.perm_manage_guild", tone: "manage", rank: 90 },
  { id: "manage_roles", bit: PERMISSIONS.MANAGE_ROLES, key: "servers.perm_manage_roles", tone: "manage", rank: 82 },
  { id: "manage_channels", bit: PERMISSIONS.MANAGE_CHANNELS, key: "servers.perm_manage_channels", tone: "manage", rank: 80 },
  { id: "view_audit_log", bit: PERMISSIONS.VIEW_AUDIT_LOG, key: "servers.perm_audit_log", tone: "info", rank: 74 },
  { id: "ban_members", bit: PERMISSIONS.BAN_MEMBERS, key: "servers.perm_ban", tone: "danger", rank: 72 },
  { id: "kick_members", bit: PERMISSIONS.KICK_MEMBERS, key: "servers.perm_kick", tone: "danger", rank: 70 },
  { id: "moderate_members", bit: PERMISSIONS.MODERATE_MEMBERS, key: "servers.perm_moderate", tone: "danger", rank: 68 },
  { id: "manage_messages", bit: PERMISSIONS.MANAGE_MESSAGES, key: "servers.perm_manage_messages", tone: "mod", rank: 64 },
  { id: "manage_webhooks", bit: PERMISSIONS.MANAGE_WEBHOOKS, key: "servers.perm_manage_webhooks", tone: "info", rank: 52 },
  { id: "manage_events", bit: PERMISSIONS.MANAGE_EVENTS, key: "servers.perm_manage_events", tone: "info", rank: 50 },
  { id: "manage_nicknames", bit: PERMISSIONS.MANAGE_NICKNAMES, key: "servers.perm_manage_nicknames", tone: "info", rank: 44 },
  { id: "voice_moderation", bit: PERMISSIONS.MUTE_MEMBERS | PERMISSIONS.DEAFEN_MEMBERS | PERMISSIONS.MOVE_MEMBERS, key: "servers.perm_voice_mod", tone: "mod", rank: 40, any: true },
  { id: "view_insights", bit: PERMISSIONS.VIEW_GUILD_INSIGHTS, key: "servers.perm_insights", tone: "info", rank: 30 },
]);

function readPermissionBits(value) {
  try { return BigInt(value ?? "0"); } catch { return 0n; }
}

function hasBit(bits, bit) { return (bits & bit) !== 0n; }

function hasPermission(bits, permission) {
  if (permission.any) return (bits & permission.bit) !== 0n;
  return (bits & permission.bit) === permission.bit;
}

function getGuildIconUrl(guild) {
  if (!guild?.id || !guild?.icon) return null;
  const ext = guild.icon.startsWith("a_") ? "gif" : "webp";
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${ext}?size=128`;
}

function getInitials(name) {
  const safeName = String(name || "?").replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  const initials = safeName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => [...part][0]?.toUpperCase()).join("");
  return initials || "?";
}

function getPermissionBadges(guild, bits) {
  const badges = [];

  if (guild.owner) {
    badges.push({ id: "owner", label: t("servers.perm_owner"), tone: "owner", rank: 120 });
  }

  if (hasBit(bits, PERMISSIONS.ADMINISTRATOR)) {
    badges.push({ id: "administrator", label: t("servers.perm_admin"), tone: "admin", rank: 110 });
    return badges;
  }

  for (const permission of IMPORTANT_PERMISSIONS) {
    if (!hasPermission(bits, permission)) continue;
    badges.push({ id: permission.id, label: t(permission.key), tone: permission.tone, rank: permission.rank });
  }

  if (!badges.length) {
    badges.push({ id: "member", label: t("servers.perm_member"), tone: "muted", rank: 0 });
  }

  return badges.sort((a, b) => b.rank - a.rank);
}

function getGuildPower(guild, bits) {
  const owner = Boolean(guild.owner);
  const admin = hasBit(bits, PERMISSIONS.ADMINISTRATOR);

  const canManage = owner || admin || hasBit(bits, PERMISSIONS.MANAGE_GUILD) || hasBit(bits, PERMISSIONS.MANAGE_ROLES) || hasBit(bits, PERMISSIONS.MANAGE_CHANNELS);
  const canModerate = owner || admin || hasBit(bits, PERMISSIONS.KICK_MEMBERS) || hasBit(bits, PERMISSIONS.BAN_MEMBERS) || hasBit(bits, PERMISSIONS.MODERATE_MEMBERS) || hasBit(bits, PERMISSIONS.MANAGE_MESSAGES) || hasBit(bits, PERMISSIONS.MUTE_MEMBERS) || hasBit(bits, PERMISSIONS.DEAFEN_MEMBERS) || hasBit(bits, PERMISSIONS.MOVE_MEMBERS);

  if (owner) return { id: "owner", label: t("servers.level_owner"), hint: t("servers.hint_owner"), rank: 0, full: true, manage: true, mod: true, member: false };
  if (admin) return { id: "admin", label: t("servers.level_admin"), hint: t("servers.hint_admin"), rank: 1, full: true, manage: true, mod: true, member: false };
  if (canManage) return { id: "manage", label: t("servers.level_manage", "Can manage"), hint: t("servers.hint_manage", "You have server management permissions."), rank: 2, full: false, manage: true, mod: canModerate, member: false };
  if (canModerate) return { id: "mod", label: t("servers.level_mod"), hint: t("servers.hint_mod"), rank: 3, full: false, manage: false, mod: true, member: false };

  return { id: "member", label: t("servers.level_member"), hint: t("servers.hint_member"), rank: 4, full: false, manage: false, mod: false, member: true };
}

function normalizeGuild(guild) {
  const bits = readPermissionBits(guild?.permissions);
  const power = getGuildPower(guild, bits);

  return {
    raw: guild,
    id: String(guild?.id ?? ""),
    name: guild?.name || t("servers.unknown"),
    iconUrl: getGuildIconUrl(guild),
    initials: getInitials(guild?.name),
    bits,
    power,
    badges: getPermissionBadges(guild, bits),
  };
}

function discordRequestError(status, body) {
  if (status === 429) {
    const retryAfter = Number(body?.retry_after ?? 0);
    const seconds = Math.ceil(retryAfter);
    return new Error(seconds > 0 ? t("servers.error_rate_limit_wait", { seconds }) : t("servers.error_rate_limit"));
  }
  if (status === 401) return new Error(t("servers.error_unauthorized"));
  if (status === 403) return new Error(t("servers.error_forbidden"));
  return new Error(t("servers.error_generic"));
}

async function fetchGuilds(sb) {
  const res = await discordApiFetch(sb, "/users/@me/guilds");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw discordRequestError(res.status, body);
  }
  const guilds = await res.json();
  return Array.isArray(guilds) ? guilds : [];
}

export async function initServersPage(sb) {
  const listEl = $("#srvList");
  const errorEl = $("#srvError");
  const errorTextEl = $("#srvErrorText");
  const retryBtn = $("#srvRetry");
  const refreshBtn = $("#srvRefresh");
  const searchEl = $("#srvSearch");

  if (!listEl) return;

  if (searchEl) searchEl.placeholder = t("servers.search_placeholder");

  const controller = createServerListController(document, { interactive: true, emptyMessages: true });

  function renderSkeleton() {
    listEl.classList.add("loading");
    listEl.replaceChildren();
    for (let i = 0; i < 6; i++) {
      const skeleton = document.createElement("div");
      skeleton.className = "srv-card card skeleton";
      skeleton.setAttribute("aria-hidden", "true");
      listEl.appendChild(skeleton);
    }
    listEl.hidden = false;
    if (errorEl) errorEl.hidden = true;
  }

  function renderError(error) {
    listEl.classList.remove("loading");
    listEl.hidden = true;
    if (errorEl) errorEl.hidden = false;
    if (errorTextEl) errorTextEl.textContent = error?.message || t("servers.error_generic");
  }

  let requestId = 0;

  async function load() {
    const currentRequest = ++requestId;
    renderSkeleton();

    try {
      const guilds = await fetchGuilds(sb);
      if (currentRequest !== requestId) return;
      controller.setGuilds(guilds.map(normalizeGuild));
      if (errorEl) errorEl.hidden = true;
    } catch (error) {
      if (currentRequest !== requestId) return;
      console.error("[servers] load failed:", error);
      renderError(error);
      hud.error(error, { title: t("servers.error_title") });
    }
  }

  retryBtn?.addEventListener("click", load);
  refreshBtn?.addEventListener("click", load);

  await load();
}