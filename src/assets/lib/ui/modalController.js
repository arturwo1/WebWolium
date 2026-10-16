import { t, onLangChange } from "@/lib/text/i18n.js";

const HISTORY_MARK = "__modalTab";
const SCOPE_PREFIX_RE = /^(?:user|guild)_/;

export function normalizeModalTabId(id) {
  return String(id ?? "").trim().replace(SCOPE_PREFIX_RE, "");
}

export function createModalController(modal, opts = {}) {
  if (!modal) return null;

  const param = opts.param === undefined ? "modal" : opts.param;
  const onOpen = typeof opts.onOpen === "function" ? opts.onOpen : null;
  const onTab = typeof opts.onTab === "function" ? opts.onTab : null;
  const onClose = typeof opts.onClose === "function" ? opts.onClose : null;
  const getParams = typeof opts.getParams === "function" ? opts.getParams : null;
  const extraKeys = Array.isArray(opts.extraKeys) ? opts.extraKeys : [];

  const tabEls = Array.from(modal.querySelectorAll("[data-modal-tab]"));
  const panelEls = Array.from(modal.querySelectorAll("[data-modal-panel]"));
  const titleEl = modal.querySelector("[data-modal-heading]");

  let activeId = tabEls[0]?.dataset?.modalTab ?? null;
  let isOpen = false;
  let urlTimer = null;

  function describe(el) {
    if (!el) return null;
    return {
      id: el.dataset.modalTab,
      el,
      panel: el.dataset.panel || "chart",
      chartType: el.dataset.chartType || ""
    };
  }

  function findTab(id) {
    const wanted = normalizeModalTabId(id);
    if (!wanted) return null;
    return describe(tabEls.find((el) => el.dataset.modalTab === wanted));
  }

  function isAvailable(tab) {
    return !!tab && !tab.el.hidden && !tab.el.disabled;
  }

  function renderTitle() {
    if (!titleEl) return;
    const key = findTab(activeId)?.el?.dataset?.titleKey;
    if (key) titleEl.textContent = t(key);
  }

  function applyTabUi(tab) {
    activeId = tab.id;

    for (const el of tabEls) {
      const active = el === tab.el;
      el.classList.toggle("is-active", active);
      el.setAttribute("aria-selected", active ? "true" : "false");
      el.setAttribute("tabindex", active ? "0" : "-1");
    }

    for (const panel of panelEls) {
      panel.hidden = panel.dataset.modalPanel !== tab.panel;
    }

    renderTitle();
  }

  function applyOpenUi(open) {
    isOpen = open;
    modal.classList.toggle("is-open", open);
    modal.setAttribute("aria-hidden", open ? "false" : "true");
  }

  function readUrlId() {
    if (!param) return "";
    try {
      return new URL(window.location.href).searchParams.get(param) || "";
    } catch {
      return "";
    }
  }

  function writeUrl(id, mode, extra) {
    if (!param) return;
    try {
      const url = new URL(window.location.href);
      for (const key of extraKeys) url.searchParams.delete(key);
      if (id) {
        url.searchParams.set(param, id);
        for (const [key, value] of Object.entries(extra ?? {})) {
          if (extraKeys.includes(key)) url.searchParams.set(key, String(value));
        }
      } else {
        url.searchParams.delete(param);
      }
      if (mode === "push") window.history.pushState({ [HISTORY_MARK]: true }, "", url);
      else window.history.replaceState(window.history.state, "", url);
    } catch { }
  }

  function refreshUrl() {
    if (!param || !isOpen || !getParams) return;
    const tab = findTab(activeId);
    if (tab) writeUrl(tab.id, "replace", getParams());
  }

  function scheduleUrlRefresh() {
    if (!param || !getParams) return;
    clearTimeout(urlTimer);
    urlTimer = setTimeout(refreshUrl, 250);
  }

  function open(id, { updateUrl = true } = {}) {
    let tab = null;

    if (tabEls.length) {
      tab = findTab(id) ?? findTab(activeId);
      if (!isAvailable(tab)) return false;
    }

    const wasOpen = isOpen;
    const changed = !!tab && tab.id !== activeId;

    if (tab) applyTabUi(tab);
    applyOpenUi(true);

    const info = { fromUrl: !updateUrl };
    if (!wasOpen) onOpen?.(tab, info);
    else if (changed) onTab?.(tab, info);

    if (updateUrl && tab && (!wasOpen || changed)) {
      writeUrl(tab.id, wasOpen ? "replace" : "push", getParams?.());
    }

    return true;
  }

  function close({ updateUrl = true } = {}) {
    if (!isOpen) return;

    applyOpenUi(false);

    if (updateUrl && param && readUrlId()) {
      if (window.history.state && window.history.state[HISTORY_MARK]) window.history.back();
      else writeUrl("", "replace");
    }

    onClose?.();
  }

  function syncFromUrl() {
    const id = readUrlId();
    if (!id) return false;

    const tab = findTab(id);
    if (isAvailable(tab)) return open(tab.id, { updateUrl: false });

    writeUrl("", "replace");
    return false;
  }

  for (const el of tabEls) {
    el.addEventListener("click", () => open(el.dataset.modalTab));
  }

  for (const btn of modal.querySelectorAll("[data-modal-close]")) {
    btn.addEventListener("click", () => close());
  }

  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  modal.addEventListener("input", scheduleUrlRefresh);
  modal.addEventListener("change", scheduleUrlRefresh);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) close();
  });

  if (param) {
    window.addEventListener("popstate", () => {
      const tab = findTab(readUrlId());
      if (isAvailable(tab)) open(tab.id, { updateUrl: false });
      else if (isOpen) close({ updateUrl: false });
    });
  }

  onLangChange(renderTitle);

  const first = findTab(activeId);
  if (first) applyTabUi(first);

  return {
    open,
    syncFromUrl,
    refreshUrl,
    isOpen: () => isOpen,
    current: () => findTab(activeId)
  };
}
