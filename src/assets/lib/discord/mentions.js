import { defaultAvatarUrl, isSnowflake } from "@/lib/discord/entities.js";

export function userHref(id) {
  return `/profile/?user_id=${id}`;
}

export function guildHref(id) {
  return isSnowflake(id) ? `/server/?guild_id=${id}` : null;
}

export function channelHref(guildId, channelId) {
  return isSnowflake(guildId) && isSnowflake(channelId) ? `https://discord.com/channels/${guildId}/${channelId}` : null;
}

export function avatarFor(entities, userId) {
  return entities?.peek("user", userId)?.avatar ?? defaultAvatarUrl(userId);
}

export function createMentionResolvers({ entities = null, guildId = null, labels = {}, fallbackName = null }) {
  const ask = (type, id) => {
    entities?.request(type, id, { guildId })?.catch?.(() => { });
  };

  return {
    resolveUser(id) {
      const name = entities?.peek("user", id)?.name || fallbackName?.(id) || labels.user || "user";
      ask("user", id);
      return { kind: "user", id, prefix: "@", label: `@${name}`, href: userHref(id) };
    },

    resolveChannel(id) {
      const data = entities?.peek("channel", id);
      ask("channel", id);
      return {
        kind: "channel",
        id,
        prefix: "#",
        label: `#${data?.name || labels.channel || "channel"}`,
        href: channelHref(data?.guildId ?? guildId, id)
      };
    },

    resolveRole(id) {
      const data = entities?.peek("role", id);
      ask("role", id);
      return { kind: "role", id, prefix: "@", label: `@${data?.name || labels.role || "role"}`, href: null, color: data?.color ?? null };
    }
  };
}

export function hydrateMentions(root, entities) {
  if (!root || !entities) return;

  for (const el of root.querySelectorAll("[data-entity]")) {
    const [type, id] = String(el.getAttribute("data-entity")).split(":");
    const data = entities.peek(type, id);
    if (!data?.name) continue;

    const text = `${el.getAttribute("data-prefix") ?? ""}${data.name}`;
    if (el.textContent !== text) el.textContent = text;
    if (type === "role" && data.color) el.style.color = data.color;
  }

  for (const img of root.querySelectorAll("[data-entity-avatar]")) {
    const src = entities.peek("user", img.getAttribute("data-entity-avatar"))?.avatar;
    if (src && img.getAttribute("src") !== src) img.setAttribute("src", src);
  }
}
