import { $, hud, t } from "@/lib/index.js";
import { discordApiFetch } from "@/lib/auth/discordProviderToken.js";

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
  {
    id: "manage_guild",
    bit: PERMISSIONS.MANAGE_GUILD,
    key: "servers.perm_manage_guild",
    fallback: "Manage server",
    tone: "manage",
    rank: 90,
  },
  {
    id: "manage_roles",
    bit: PERMISSIONS.MANAGE_ROLES,
    key: "servers.perm_manage_roles",
    fallback: "Manage roles",
    tone: "manage",
    rank: 82,
  },
  {
    id: "manage_channels",
    bit: PERMISSIONS.MANAGE_CHANNELS,
    key: "servers.perm_manage_channels",
    fallback: "Manage channels",
    tone: "manage",
    rank: 80,
  },
  {
    id: "view_audit_log",
    bit: PERMISSIONS.VIEW_AUDIT_LOG,
    key: "servers.perm_audit_log",
    fallback: "Audit log",
    tone: "info",
    rank: 74,
  },
  {
    id: "ban_members",
    bit: PERMISSIONS.BAN_MEMBERS,
    key: "servers.perm_ban",
    fallback: "Ban members",
    tone: "danger",
    rank: 72,
  },
  {
    id: "kick_members",
    bit: PERMISSIONS.KICK_MEMBERS,
    key: "servers.perm_kick",
    fallback: "Kick members",
    tone: "danger",
    rank: 70,
  },
  {
    id: "moderate_members",
    bit: PERMISSIONS.MODERATE_MEMBERS,
    key: "servers.perm_moderate",
    fallback: "Timeout members",
    tone: "danger",
    rank: 68,
  },
  {
    id: "manage_messages",
    bit: PERMISSIONS.MANAGE_MESSAGES,
    key: "servers.perm_manage_messages",
    fallback: "Manage messages",
    tone: "mod",
    rank: 64,
  },
  {
    id: "manage_webhooks",
    bit: PERMISSIONS.MANAGE_WEBHOOKS,
    key: "servers.perm_manage_webhooks",
    fallback: "Manage webhooks",
    tone: "info",
    rank: 52,
  },
  {
    id: "manage_events",
    bit: PERMISSIONS.MANAGE_EVENTS,
    key: "servers.perm_manage_events",
    fallback: "Manage events",
    tone: "info",
    rank: 50,
  },
  {
    id: "manage_nicknames",
    bit: PERMISSIONS.MANAGE_NICKNAMES,
    key: "servers.perm_manage_nicknames",
    fallback: "Manage nicknames",
    tone: "info",
    rank: 44,
  },
  {
    id: "voice_moderation",
    bit: PERMISSIONS.MUTE_MEMBERS | PERMISSIONS.DEAFEN_MEMBERS | PERMISSIONS.MOVE_MEMBERS,
    key: "servers.perm_voice_mod",
    fallback: "Voice moderation",
    tone: "mod",
    rank: 40,
    any: true,
  },
  {
    id: "view_insights",
    bit: PERMISSIONS.VIEW_GUILD_INSIGHTS,
    key: "servers.perm_insights",
    fallback: "Insights",
    tone: "info",
    rank: 30,
  },
]);

const state = {
  guilds: [],
  filter: "all",
  query: "",
};

function createEl(tag, options = {}) {
  const node = document.createElement(tag);

  if (options.className) node.className = options.className;
  if (options.text != null) node.textContent = options.text;
  if (options.html != null) node.innerHTML = options.html;

  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value == null) continue;
      node.setAttribute(key, String(value));
    }
  }

  return node;
}

function setText(node, value) {
  if (node) node.textContent = String(value);
}

function setHidden(node, hidden) {
  if (node) node.hidden = hidden;
}

function readPermissionBits(value) {
  try {
    return BigInt(value ?? "0");
  } catch {
    return 0n;
  }
}

function hasBit(bits, bit) {
  return (bits & bit) !== 0n;
}

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
  const safeName = String(name || "?")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim();

  const initials = safeName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => [...part][0]?.toUpperCase())
    .join("");

  return initials || "?";
}

function getPermissionBadges(guild, bits) {
  const badges = [];

  if (guild.owner) {
    badges.push({
      id: "owner",
      label: t("servers.perm_owner"),
      tone: "owner",
      rank: 120,
    });
  }

  if (hasBit(bits, PERMISSIONS.ADMINISTRATOR)) {
    badges.push({
      id: "administrator",
      label: t("servers.perm_admin"),
      tone: "admin",
      rank: 110,
    });

    return badges;
  }

  for (const permission of IMPORTANT_PERMISSIONS) {
    if (!hasPermission(bits, permission)) continue;

    badges.push({
      id: permission.id,
      label: t(permission.key),
      tone: permission.tone,
      rank: permission.rank,
    });
  }

  if (!badges.length) {
    badges.push({
      id: "member",
      label: t("servers.perm_member"),
      tone: "muted",
      rank: 0,
    });
  }

  return badges.sort((a, b) => b.rank - a.rank);
}

function getGuildPower(guild, bits) {
  const owner = Boolean(guild.owner);
  const admin = hasBit(bits, PERMISSIONS.ADMINISTRATOR);

  const canManage =
    owner ||
    admin ||
    hasBit(bits, PERMISSIONS.MANAGE_GUILD) ||
    hasBit(bits, PERMISSIONS.MANAGE_ROLES) ||
    hasBit(bits, PERMISSIONS.MANAGE_CHANNELS);

  const canModerate =
    owner ||
    admin ||
    hasBit(bits, PERMISSIONS.KICK_MEMBERS) ||
    hasBit(bits, PERMISSIONS.BAN_MEMBERS) ||
    hasBit(bits, PERMISSIONS.MODERATE_MEMBERS) ||
    hasBit(bits, PERMISSIONS.MANAGE_MESSAGES) ||
    hasBit(bits, PERMISSIONS.MUTE_MEMBERS) ||
    hasBit(bits, PERMISSIONS.DEAFEN_MEMBERS) ||
    hasBit(bits, PERMISSIONS.MOVE_MEMBERS);

  if (owner) {
    return {
      id: "owner",
      label: t("servers.level_owner"),
      hint: t("servers.hint_owner"),
      rank: 0,
      full: true,
      manage: true,
      mod: true,
      member: false,
    };
  }

  if (admin) {
    return {
      id: "admin",
      label: t("servers.level_admin"),
      hint: t("servers.hint_admin"),
      rank: 1,
      full: true,
      manage: true,
      mod: true,
      member: false,
    };
  }

  if (canManage) {
    return {
      id: "manage",
      label: t("servers.level_manage", "Can manage"),
      hint: t("servers.hint_manage", "You have server management permissions."),
      rank: 2,
      full: false,
      manage: true,
      mod: canModerate,
      member: false,
    };
  }

  if (canModerate) {
    return {
      id: "mod",
      label: t("servers.level_mod"),
      hint: t("servers.hint_mod"),
      rank: 3,
      full: false,
      manage: false,
      mod: true,
      member: false,
    };
  }

  return {
    id: "member",
    label: t("servers.level_member"),
    hint: t("servers.hint_member"),
    rank: 4,
    full: false,
    manage: false,
    mod: false,
    member: true,
  };
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

function sortGuilds(a, b) {
  if (a.power.rank !== b.power.rank) return a.power.rank - b.power.rank;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function matchesFilter(guild) {
  if (state.filter === "full") return guild.power.full;
  if (state.filter === "manage") return guild.power.manage;
  if (state.filter === "mod") return guild.power.mod;
  if (state.filter === "member") return guild.power.member;
  return true;
}

function matchesSearch(guild) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;

  return guild.name.toLowerCase().includes(query);
}

function getVisibleGuilds() {
  return state.guilds
    .filter(guild => matchesFilter(guild) && matchesSearch(guild))
    .sort(sortGuilds);
}

function buildIcon(guild) {
  const wrap = createEl("div", { className: "srv-card__icon" });

  if (guild.iconUrl) {
    const img = createEl("img", {
      className: "srv-card__img",
      attrs: {
        src: guild.iconUrl,
        alt: "",
        loading: "lazy",
        width: "64",
        height: "64",
      },
    });

    wrap.appendChild(img);
    return wrap;
  }

  wrap.appendChild(createEl("span", {
    className: "srv-card__fallback",
    text: guild.initials,
    attrs: { "aria-hidden": "true" },
  }));

  return wrap;
}

function buildBadge(badge) {
  return createEl("span", {
    className: `srv-badge srv-badge--${badge.tone}`,
    text: badge.label,
  });
}

function buildServerCard(guild) {
  const card = createEl("a", {
    className: "srv-card card card-hover",
    attrs: {
      href: `/server/?guild_id=${encodeURIComponent(guild.id)}&administrator=${guild.badges.some(badge => ["administrator", "owner"].includes(badge.id))}`,
      "data-power": guild.power.id,
      "aria-label": `${t("servers.open_server")}: ${guild.name}`,
    },
  });

  const body = createEl("div", { className: "srv-card__body" });

  const top = createEl("div", { className: "srv-card__top" });

  const name = createEl("span", {
    className: "srv-card__name text-truncate",
    text: guild.name,
  });

  const level = createEl("span", {
    className: `srv-level srv-level--${guild.power.id}`,
    text: guild.power.label,
  });

  top.append(name, level);

  const hint = createEl("p", {
    className: "srv-card__hint text-truncate",
    text: guild.power.hint,
  });

  const badges = createEl("div", { className: "srv-card__badges" });

  const visibleBadges = guild.badges.slice(0, 8);
  for (const badge of visibleBadges) {
    badges.appendChild(buildBadge(badge));
  }

  if (guild.badges.length > visibleBadges.length) {
    badges.appendChild(createEl("span", {
      className: "srv-badge srv-badge--muted",
      text: `+${guild.badges.length - visibleBadges.length}`,
    }));
  }

  body.append(top, hint, badges);

  const arrow = createEl("span", {
    className: "srv-card__arrow",
    html: `<svg class="icon" width="18" height="18" aria-hidden="true"><use href="#right"></use></svg>`,
    attrs: { "aria-hidden": "true" },
  });

  card.append(buildIcon(guild), body, arrow);
  return card;
}

function renderStats(nodes) {
  const all = state.guilds.length;
  const full = state.guilds.filter(guild => guild.power.full).length;
  const manage = state.guilds.filter(guild => guild.power.manage).length;
  const mod = state.guilds.filter(guild => guild.power.mod).length;

  setText(nodes.statAll, all);
  setText(nodes.statFull, full);
  setText(nodes.statManage, manage);
  setText(nodes.statMod, mod);
}

function renderFilters(nodes) {
  const buttons = nodes.filters?.querySelectorAll("[data-srv-filter]") ?? [];

  for (const button of buttons) {
    const active = button.dataset.srvFilter === state.filter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function renderEmpty(nodes, isFiltered) {
  setHidden(nodes.list, true);
  setHidden(nodes.empty, false);
  setHidden(nodes.error, true);

  if (isFiltered) {
    setText(nodes.emptyTitle, t("servers.empty_filter_title"));
    setText(nodes.emptyText, t("servers.empty_filter_text"));
    setHidden(nodes.addBot, true);
    return;
  }

  setText(nodes.emptyTitle, t("servers.empty_title"));
  setText(nodes.emptyText, t("servers.empty_text"));
  setHidden(nodes.addBot, false);
}

function renderList(nodes) {
  renderStats(nodes);
  renderFilters(nodes);

  const guilds = getVisibleGuilds();
  const isFiltered = state.guilds.length > 0 && guilds.length === 0;

  nodes.list.classList.remove("loading");
  nodes.list.replaceChildren();

  if (!state.guilds.length || isFiltered) {
    renderEmpty(nodes, isFiltered);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const guild of guilds) {
    fragment.appendChild(buildServerCard(guild));
  }

  nodes.list.appendChild(fragment);

  setHidden(nodes.list, false);
  setHidden(nodes.empty, true);
  setHidden(nodes.error, true);
}

function renderSkeleton(nodes) {
  nodes.list.classList.add("loading");
  nodes.list.replaceChildren();

  for (let i = 0; i < 6; i++) {
    nodes.list.appendChild(createEl("div", {
      className: "srv-card card skeleton",
      attrs: { "aria-hidden": "true" },
    }));
  }

  setText(nodes.statAll, "—");
  setText(nodes.statFull, "—");
  setText(nodes.statManage, "—");
  setText(nodes.statMod, "—");

  setHidden(nodes.list, false);
  setHidden(nodes.empty, true);
  setHidden(nodes.error, true);
}

function renderError(nodes, error) {
  nodes.list.classList.remove("loading");

  setHidden(nodes.list, true);
  setHidden(nodes.empty, true);
  setHidden(nodes.error, false);

  setText(nodes.errorText, error?.message || t("servers.error_generic"));
}

function discordRequestError(status, body) {
  if (status === 429) {
    const retryAfter = Number(body?.retry_after ?? 0);
    const seconds = Math.ceil(retryAfter);

    return new Error(
      seconds > 0
        ? t("servers.error_rate_limit_wait", { seconds: seconds })
        : t("servers.error_rate_limit")
    );
  }

  if (status === 401) {
    return new Error(t("servers.error_unauthorized"));
  }

  if (status === 403) {
    return new Error(t("servers.error_forbidden"));
  }

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

function bindEvents(nodes, load) {
  nodes.retry?.addEventListener("click", load);
  nodes.refresh?.addEventListener("click", load);

  nodes.search?.addEventListener("input", () => {
    state.query = nodes.search.value;
    renderList(nodes);
  });

  nodes.filters?.addEventListener("click", event => {
    const button = event.target.closest("[data-srv-filter]");
    if (!button || !nodes.filters.contains(button)) return;

    state.filter = button.dataset.srvFilter || "all";
    renderList(nodes);
  });
}

export async function initServersPage(sb) {
  const nodes = {
    list: $("#srvList"),
    empty: $("#srvEmpty"),
    emptyTitle: $("#srvEmptyTitle"),
    emptyText: $("#srvEmptyText"),
    addBot: $("#srvAddBot"),
    error: $("#srvError"),
    errorText: $("#srvErrorText"),
    retry: $("#srvRetry"),
    refresh: $("#srvRefresh"),
    search: $("#srvSearch"),
    filters: $("#srvFilters"),
    statAll: $("#srvStatAll"),
    statFull: $("#srvStatFull"),
    statManage: $("#srvStatManage"),
    statMod: $("#srvStatMod"),
  };

  if (!nodes.list) return;

  if (nodes.search) {
    nodes.search.placeholder = t("servers.search_placeholder");
  }

  let requestId = 0;

  async function load() {
    const currentRequest = ++requestId;

    renderSkeleton(nodes);

    try {
      const guilds = await fetchGuilds(sb);

      if (currentRequest !== requestId) return;

      state.guilds = guilds.map(normalizeGuild);
      renderList(nodes);
    } catch (error) {
      if (currentRequest !== requestId) return;

      console.error("[servers] load failed:", error);
      renderError(nodes, error);
      hud.error(error, { title: t("servers.error_title") });
    }
  }

  bindEvents(nodes, load);

  await load();
}