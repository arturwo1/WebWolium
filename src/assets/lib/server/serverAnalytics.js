import { formatNumber } from "@/lib/index.js";

function formatMoney(n) {
  return `${formatNumber(n)}₩`;
}

function field(root, name) {
  return root.querySelector(`[data-field="${name}"]`);
}

export function computeServerAnalyticsDisplayData(res, translate) {
  const now = Number(res?.xp_now ?? 0);
  const need = Number(res?.xp_need ?? 0);
  const pct = need > 0 ? Math.min(100, Math.max(0, (now / need) * 100)) : 0;

  return {
    name: res?.name ?? translate("servers.unknown"),
    icon: res?.icon ?? null,
    levelText: translate("profile.level", { level: formatNumber(res?.lvl) }),
    xpLineText: translate("profile.xp_line", {
      now: formatNumber(res?.xp_now),
      need: formatNumber(res?.xp_need),
      total: formatNumber(res?.xp)
    }),
    xpPercent: pct,
    badges: res?.badges ?? [],
    messages: formatNumber(res?.messages),
    voice: res?.voice_time ?? "00:00",
    activities: res?.activity_seconds ?? "00:00",
    total: formatMoney(res?.total_balance),
    bank: formatMoney(res?.bank_balance),
    cash: formatMoney(res?.balance),
    members: formatNumber(res?.members),
  };
}

export function applyServerAnalyticsData(root, res, translate, hasSpriteSymbol) {
  const display = computeServerAnalyticsDisplayData(res, translate);

  const set = (name, val) => {
    const el = field(root, name);
    if (el) el.textContent = String(val);
  };

  set("stat-messages", display.messages);
  set("stat-voice", display.voice);
  set("stat-activities", display.activities);
  set("stat-money-total", display.total);
  set("stat-money-bank", display.bank);
  set("stat-money-cash", display.cash);
  set("stat-members", display.members);
  set("xp-line", display.xpLineText);
  set("level", display.levelText);
  set("name", display.name);

  const xpBar = field(root, "xp-bar");
  const xpBarContainer = field(root, "xp-bar-container");
  if (xpBar) {
    xpBar.style.width = `${display.xpPercent}%`;
    if (xpBarContainer) xpBarContainer.ariaValueNow = Math.round(display.xpPercent);
  }

  const pfp = field(root, "pfp");
  if (pfp && display.icon) pfp.src = display.icon;

  const badgeRowEl = field(root, "badges");
  if (badgeRowEl) {
    let list = display.badges;
    if (typeof list === "string") {
      try { list = JSON.parse(list); } catch { list = []; }
    }
    if (!Array.isArray(list)) list = [];

    const valid = list
      .map(x => String(x ?? "").trim())
      .filter(Boolean)
      .filter(id => hasSpriteSymbol ? hasSpriteSymbol(id) : true);

    if (!valid.length) {
      badgeRowEl.innerHTML = "";
      badgeRowEl.hidden = true;
    } else {
      badgeRowEl.innerHTML = valid.map(id => {
        const title = translate(`server.badges.${id}`);
        return `<div class="badge" title="${title}" aria-label="${title}"><svg class="icon badge-icon" aria-hidden="true" viewBox="0 0 24 24"><use href="#${id}"></use></svg></div>`;
      }).join("");
      badgeRowEl.hidden = false;
    }
  }

  root.querySelector(".profile-card")?.classList.remove("loading");
  root.querySelector(".stats")?.classList.remove("loading");
}