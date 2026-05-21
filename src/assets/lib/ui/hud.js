import { t as tr } from '@/lib/text/i18n.js';

const DOCK_ID = "toast";
const MAX_ITEMS = 4;
const ANIM_MS = 220;
const RECENT_TTL_MS = 10_000;

function ensureDock() {
  if (typeof document === "undefined") return null;
  let dock = document.getElementById(DOCK_ID);
  if (!dock) {
    dock = document.createElement("div");
    dock.id = DOCK_ID;
    dock.className = "toast";
    dock.setAttribute("aria-live", "polite");
    dock.setAttribute("aria-atomic", "true");
    document.body.appendChild(dock);
  }
  return dock;
}

function animateIn(el) {
  requestAnimationFrame(() => el.classList.add("is-on"));
}

function animateOutAndRemove(el) {
  el.classList.remove("is-on");
  setTimeout(() => el.remove(), ANIM_MS);
}

function textOf(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || String(err);
  if (typeof err === "object" && "message" in err) return String(err.message || "");
  return String(err);
}

function prettyErrorMessage(err) {
  const msg = textOf(err);
  if (!msg) return tr("error.unknown");
  if (msg === "NOT_LOGGED_IN") return tr("error.not_logged_in");
  if (msg === "timeout") return tr("error.timeout");
  if (msg === "RPC_REJECTED_TOO_MANY_TIMES") return tr("error.too_many_requests");
  return msg.split("\n")[0].slice(0, 220);
}

function kindLabel(kind) {
  if (!kind) return tr("loading");
  if (kind === "messages_series") return tr("loading.messages");
  if (kind === "voice_series") return tr("loading.voice");
  if (kind === "activities_series") return tr("loading.activity");
  return tr("loading");
}

function makeItem({ title, text, type = "info", showSpinner = false, closable = true }) {
  const el = document.createElement("div");
  el.className = `toast__item toast__item--${type}`;

  const icon = document.createElement("div");
  icon.className = "toast__icon";
  icon.setAttribute("aria-hidden", "true");
  if (showSpinner) {
    const sp = document.createElement("span");
    sp.className = "spinner";
    icon.appendChild(sp);
  }

  const body = document.createElement("div");
  body.className = "toast__body";

  const titleEl = document.createElement("div");
  titleEl.className = "toast__title";
  titleEl.textContent = title || "";

  const textEl = document.createElement("div");
  textEl.className = "toast__text";
  textEl.textContent = text || "";

  body.appendChild(titleEl);
  if (text) body.appendChild(textEl);

  const meta = document.createElement("div");
  meta.className = "toast__meta";

  const badge = document.createElement("div");
  badge.className = "toast__count";
  badge.style.display = "none";
  meta.appendChild(badge);

  if (closable) {
    const close = document.createElement("button");
    close.className = "toast__close";
    close.type = "button";
    close.innerHTML = '<svg><use href="#close"></use></svg>';
    close.setAttribute("aria-label", tr("common.close"));
    close.addEventListener("click", () => animateOutAndRemove(el));
    meta.appendChild(close);
  }

  el.appendChild(icon);
  el.appendChild(body);
  el.appendChild(meta);

  return { el, badge, titleEl, textEl };
}

function trimDock(dock, recent) {
  const items = Array.from(dock.querySelectorAll('.toast__item:not(.toast__item--loading)'));
  while (items.length > MAX_ITEMS) {
    const oldest = items.shift();
    if (!oldest) continue;
    for (const [k, v] of recent) {
      if (v.el === oldest) { recent.delete(k); break; }
    }
    oldest.remove();
  }
}

function cleanRecent(recent) {
  const now = Date.now();
  for (const [k, v] of recent) {
    if (now - v.at > RECENT_TTL_MS || !v.el.isConnected) {
      recent.delete(k);
    }
  }
}

function hashKey(type, title, text) {
  return `${type}::${title || ""}::${text || ""}`.toLowerCase();
}

const loadingStack = [];

const state = {
  loadingEl: null,
  recent: new Map()
};

function showToast(dock, type, title, text, duration) {
  const key = hashKey(type, title, text);
  const now = Date.now();

  cleanRecent(state.recent);

  const prev = state.recent.get(key);
  if (prev?.el?.isConnected && now - prev.at < 2500) {
    prev.count += 1;
    prev.at = now;
    prev.badge.style.display = "";
    prev.badge.textContent = `×${prev.count}`;
    prev.el.classList.remove("is-on");
    requestAnimationFrame(() => prev.el.classList.add("is-on"));
    return;
  }

  const { el, badge } = makeItem({ title, text, type, closable: true });
  dock.appendChild(el);
  animateIn(el);

  state.recent.set(key, { el, badge, count: 1, at: now });
  trimDock(dock, state.recent);

  setTimeout(() => {
    if (el.isConnected) animateOutAndRemove(el);
    state.recent.delete(key);
  }, duration);
}

export const hud = {
  loading(kindOrLabel = "") {
    const dock = ensureDock();
    if (!dock) return () => { };

    const label = kindOrLabel.includes("…") || kindOrLabel.includes("...")
      ? kindOrLabel
      : kindLabel(kindOrLabel);

    loadingStack.push(label);

    if (!state.loadingEl) {
      const { el, badge, titleEl } = makeItem({
        title: label,
        type: "loading",
        showSpinner: true,
        closable: false
      });
      el.classList.add("toast__item--loading");
      dock.appendChild(el);
      animateIn(el);
      state.loadingEl = { el, badge, titleEl };
    } else {
      state.loadingEl.titleEl.textContent = label;
    }

    const updateBadge = () => {
      if (!state.loadingEl) return;
      const c = loadingStack.length;
      if (c > 1) {
        state.loadingEl.badge.style.display = "";
        state.loadingEl.badge.textContent = `×${c}`;
      } else {
        state.loadingEl.badge.style.display = "none";
      }
    };

    updateBadge();

    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;

      const idx = loadingStack.lastIndexOf(label);
      if (idx !== -1) loadingStack.splice(idx, 1);

      if (loadingStack.length === 0) {
        if (state.loadingEl) {
          const el = state.loadingEl.el;
          state.loadingEl = null;
          animateOutAndRemove(el);
        }
      } else {
        if (state.loadingEl) {
          state.loadingEl.titleEl.textContent = loadingStack[loadingStack.length - 1];
        }
        updateBadge();
      }
    };
  },

  error(err, ctx = {}) {
    const dock = ensureDock();
    if (!dock) return;
    const title = ctx.title || tr("error");
    const text = ctx.text || prettyErrorMessage(err);
    showToast(dock, "error", title, text, 7000);
  },

  success(text, ctx = {}) {
    const dock = ensureDock();
    if (!dock) return;
    const title = ctx.title || tr("success");
    showToast(dock, "success", title, text || "", 4000);
  },

  info(text, ctx = {}) {
    const dock = ensureDock();
    if (!dock) return;
    const title = ctx.title || tr("info");
    showToast(dock, "info", title, text || "", 5000);
  }
};