const DOCK_ID = "toast";
const MAX_ITEMS = 4;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

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
  setTimeout(() => el.remove(), 220);
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
  if (!msg) return "Unknown error.";

  if (msg === "NOT_LOGGED_IN") return "Need to log in.";
  if (msg === "timeout") return "Server is too slow to respond.";
  if (msg === "RPC_REJECTED_TOO_MANY_TIMES") return "Too many requests in a row. Try again later.";

  return msg.split("\n")[0].slice(0, 220);
}

function kindLabel(kind) {
  if (!kind) return "Loading…";
  if (kind === "messages_series") return "Loading messages…";
  if (kind === "voice_series") return "Loading voice…";
  return "Loading data…";
}

function makeItem({
  title,
  text,
  type = "info",
  showSpinner = false,
  count = 1,
  closable = true
}) {
  const el = document.createElement("div");
  el.className = `toast__item toast__item--${type}`;

  const icon = document.createElement("div");
  icon.className = "toast__icon";
  if (showSpinner) {
    const sp = document.createElement("span");
    sp.className = "spinner";
    sp.setAttribute("aria-hidden", "true");
    icon.appendChild(sp);
  } else {
    icon.textContent = type === "error" ? "!" : "•";
    icon.setAttribute("aria-hidden", "true");
  }

  const body = document.createElement("div");
  body.className = "toast__body";

  const t = document.createElement("div");
  t.className = "toast__title";
  t.textContent = title || "";

  const x = document.createElement("div");
  x.className = "toast__text";
  x.textContent = text || "";

  body.appendChild(t);
  if (text) body.appendChild(x);

  const meta = document.createElement("div");
  meta.className = "toast__meta";

  const badge = document.createElement("div");
  badge.className = "toast__count";
  badge.textContent = count > 1 ? `×${count}` : "";
  badge.style.display = count > 1 ? "" : "none";

  meta.appendChild(badge);

  if (closable) {
    const close = document.createElement("button");
    close.className = "toast__close";
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => animateOutAndRemove(el));
    meta.appendChild(close);
  }

  el.appendChild(icon);
  el.appendChild(body);
  el.appendChild(meta);

  return { el, badge, titleEl: t, textEl: x };
}

function trimDock(dock) {
  const items = Array.from(dock.querySelectorAll('.toast__item:not(.toast__item--loading)'));
  while (items.length > MAX_ITEMS) {
    const oldest = items.shift();
    if (oldest) oldest.remove();
  }
}

function hashKey(type, title, text) {
  return `${type}::${title || ""}::${text || ""}`.toLowerCase();
}

const state = {
  loadingCount: 0,
  loadingEl: null,
  recent: new Map()
};

export const hud = {
  loading(kindOrLabel = "") {
    const dock = ensureDock();
    if (!dock) return () => {};

    const label = kindOrLabel.includes("…") || kindOrLabel.includes("...")
      ? kindOrLabel
      : kindLabel(kindOrLabel);

    state.loadingCount += 1;

    if (!state.loadingEl) {
      const { el, badge, titleEl } = makeItem({
        title: label,
        text: "",
        type: "loading",
        showSpinner: true,
        count: state.loadingCount,
        closable: false
      });
      el.classList.add("toast__item--loading");
      dock.appendChild(el);
      animateIn(el);
      state.loadingEl = { el, badge, titleEl };
    } else {
      state.loadingEl.titleEl.textContent = label;
    }

    const updateCount = () => {
      const c = clamp(state.loadingCount, 0, 99);
      if (!state.loadingEl) return;
      if (c > 1) {
        state.loadingEl.badge.style.display = "";
        state.loadingEl.badge.textContent = `×${c}`;
      } else {
        state.loadingEl.badge.style.display = "none";
        state.loadingEl.badge.textContent = "";
      }
    };

    updateCount();

    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      state.loadingCount = Math.max(0, state.loadingCount - 1);
      if (state.loadingCount === 0 && state.loadingEl) {
        const el = state.loadingEl.el;
        state.loadingEl = null;
        animateOutAndRemove(el);
      } else {
        updateCount();
      }
    };
  },

  error(err, ctx = {}) {
    const dock = ensureDock();
    if (!dock) return;

    const title = ctx.title || "Error";
    const text = ctx.text || prettyErrorMessage(err);
    const key = ctx.key || hashKey("error", title, text);

    const now = Date.now();
    const prev = state.recent.get(key);

    if (prev && prev.el && now - prev.at < 2500) {
      prev.count += 1;
      prev.at = now;
      if (prev.badge) {
        prev.badge.style.display = "";
        prev.badge.textContent = `×${prev.count}`;
      }
      prev.el.classList.remove("is-on");
      requestAnimationFrame(() => prev.el.classList.add("is-on"));
      return;
    }

    const { el, badge } = makeItem({
      title,
      text,
      type: "error",
      showSpinner: false,
      count: 1,
      closable: true
    });

    dock.appendChild(el);
    animateIn(el);

    state.recent.set(key, { el, badge, count: 1, at: now });
    trimDock(dock);

    setTimeout(() => {
      if (el.isConnected) animateOutAndRemove(el);
    }, 7000);
  }
};
