import { createRng, pick } from "./rng.js";
import { DEMO_GUILD_NAMES } from "./demoNames.js";

const POWER_LEVELS = [
  { id: "owner", labelKey: "servers.level_owner", labelFallback: "Owner", hintKey: "servers.hint_owner", hintFallback: "You own this server.", rank: 0, full: true, manage: true, mod: true, member: false, badges: [{ key: "servers.perm_owner", fallback: "Owner", tone: "owner" }] },
  { id: "admin", labelKey: "servers.level_admin", labelFallback: "Admin", hintKey: "servers.hint_admin", hintFallback: "You have administrator access.", rank: 1, full: true, manage: true, mod: true, member: false, badges: [{ key: "servers.perm_admin", fallback: "Administrator", tone: "admin" }] },
  { id: "manage", labelKey: "servers.level_manage", labelFallback: "Can manage", hintKey: "servers.hint_manage", hintFallback: "You have server management permissions.", rank: 2, full: false, manage: true, mod: true, member: false, badges: [{ key: "servers.perm_manage_guild", fallback: "Manage server", tone: "manage" }, { key: "servers.perm_manage_channels", fallback: "Manage channels", tone: "manage" }] },
  { id: "mod", labelKey: "servers.level_mod", labelFallback: "Moderator", hintKey: "servers.hint_mod", hintFallback: "You have moderation permissions.", rank: 3, full: false, manage: false, mod: true, member: false, badges: [{ key: "servers.perm_ban", fallback: "Ban members", tone: "danger" }, { key: "servers.perm_kick", fallback: "Kick members", tone: "danger" }] },
  { id: "member", labelKey: "servers.level_member", labelFallback: "Member", hintKey: "servers.hint_member", hintFallback: "You're a member of this server.", rank: 4, full: false, manage: false, mod: false, member: true, badges: [{ key: "servers.perm_member", fallback: "Member", tone: "muted" }] },
];

function defaultTranslate(key, fallback) {
  return fallback;
}

function toGuild(power, name, iconUrl, translate) {
  return {
    id: `demo-${power.id}-${name}`,
    name,
    iconUrl,
    initials: name.slice(0, 2).toUpperCase(),
    power: {
      id: power.id,
      label: translate(power.labelKey, power.labelFallback),
      labelKey: power.labelKey,
      hint: translate(power.hintKey, power.hintFallback),
      hintKey: power.hintKey,
      rank: power.rank,
      full: power.full,
      manage: power.manage,
      mod: power.mod,
      member: power.member,
    },
    badges: power.badges.map(b => ({
      id: b.key,
      key: b.key,
      label: translate(b.key, b.fallback),
      tone: b.tone,
    })),
  };
}

export function generateFakeServersData(seed, options = {}) {
  const rng = typeof seed === "function" ? seed : createRng(seed ?? Date.now());
  const translate = options.translate ?? defaultTranslate;

  const shuffledNames = [...DEMO_GUILD_NAMES].sort(() => rng() - 0.5);

  const guilds = POWER_LEVELS.map((power, i) => {
    const name = shuffledNames[i] ?? pick(rng, DEMO_GUILD_NAMES);
    const iconUrl = `https://api.dicebear.com/9.x/shapes/svg?seed=${Math.floor(rng() * 1e9)}`;
    return toGuild(power, name, iconUrl, translate);
  });

  const stats = {
    all: guilds.length,
    full: guilds.filter(g => g.power.full).length,
    manage: guilds.filter(g => g.power.manage).length,
    mod: guilds.filter(g => g.power.mod).length,
  };

  return { guilds, stats };
}