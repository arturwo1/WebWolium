import { t } from "@/lib/index.js";

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

function buildIcon(guild) {
  const wrap = createEl("div", { className: "srv-card__icon" });

  if (guild.iconUrl) {
    const img = createEl("img", {
      className: "srv-card__img",
      attrs: { src: guild.iconUrl, alt: "", loading: "lazy", width: "64", height: "64" },
    });
    wrap.appendChild(img);
    return wrap;
  }

  wrap.appendChild(createEl("span", {
    className: "srv-card__fallback",
    text: guild.initials ?? "?",
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

export function buildServerCard(guild, { interactive = true } = {}) {
  const tag = interactive ? "a" : "div";

  const card = createEl(tag, {
    className: "srv-card card card-hover",
    attrs: interactive ? {
      href: `/server/?guild_id=${encodeURIComponent(guild.id)}&administrator=${guild.badges.some(badge => ["administrator", "owner"].includes(badge.id))}`,
      "data-power": guild.power.id,
      "aria-label": `${t("servers.open_server")}: ${guild.name}`,
    } : {
      "data-power": guild.power.id,
    },
  });

  const body = createEl("div", { className: "srv-card__body" });
  const top = createEl("div", { className: "srv-card__top" });

  const name = createEl("span", { className: "srv-card__name text-truncate", text: guild.name });
  const level = createEl("span", { className: `srv-level srv-level--${guild.power.id}`, text: guild.power.label });

  top.append(name, level);

  const hint = createEl("p", { className: "srv-card__hint text-truncate", text: guild.power.hint });

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