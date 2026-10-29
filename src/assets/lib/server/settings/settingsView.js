import { escapeHtml } from "@/lib/security/html.js";
import { createCustomSelect } from "@/lib/ui/customSelect.js";
import { fieldTypes, FieldError } from "./fieldTypes.js";
import { createSettingsRoute } from "./settingsRoute.js";
import { createSettingsState } from "./settingsState.js";

const LAYOUT_BREAKPOINTS = { medium: 700, wide: 1100 };
const DRAG_THRESHOLD = 6;
function createStaticRoute() {
  return {
    readPath: () => [],
    writePath: () => {},
    canGoBack: () => false,
    goBack: () => {},
    destroy: () => {}
  };
}

export function mountSettings(rootElement, { registry, values, channels, roles, translate, onSave, search = null, demo = false }) {
  const availableRegistry = registry.filter((category) => values?.[category.store] !== undefined);
  const context = { channels, roles, translate };
  const state = createSettingsState({ registry: availableRegistry, values, context });
  const { categories, fieldIndex } = state;

  const portal = document.createElement("div");
  portal.className = "st-portal";
  portal.innerHTML = '<div class="st-bar"></div>';
  document.body.appendChild(portal);
  const barElement = portal.querySelector(".st-bar");
  const searchInput = search?.panel.querySelector("[data-settings-search]") ?? null;
  const hitsElement = search?.panel.querySelector("[data-settings-hits]") ?? null;
  const canSearch = Boolean(search && searchInput && hitsElement);
  const isPaletteOpen = () => canSearch && search.controller.isOpen() && search.controller.current()?.id === search.tabId;
  let dragState = null;

  let layout = "";
  let path = [];
  let isMenuOpen = false;
  let isDiffOpen = false;
  let isSaving = false;
  let errors = new Map();
  let pendingReveal = null;
  let isBarVisible = false;
  let selectInstances = [];

  rootElement.classList.add("st");

  const route = demo ? createStaticRoute() : createSettingsRoute({
    onPathChange: (nextPath) => {
      const normalized = normalizePath(nextPath);
      if (normalized.join("/") === path.join("/")) return;
      path = normalized;
      isMenuOpen = false;
      render();
    }
  });

  function normalizePath(candidate) {
    const category = categories.find((item) => item.id === candidate[0]);
    if (!category) return [];
    const group = category.groups.find((item) => item.id === candidate[1]);
    return group ? [category.id, group.id] : [category.id];
  }

  function labelOf(entry) {
    return translate(entry.field.labelKey ?? `server.flag_${entry.field.key}`);
  }

  function hintOf(entry) {
    const key = entry.field.hintKey ?? `server.tooltip_${entry.field.key}`;
    const text = translate(key);
    return text === key ? "" : text;
  }

  function summaryOf(owner, store) {
    if (!owner.summary) return "";
    return owner.summary({ value: (key) => state.getStoreValue(store, key), translate, context });
  }

  function renderRow(entry) {
    const { field, id } = entry;
    const type = fieldTypes[field.type];
    const value = state.getValue(id);
    const changed = state.isChanged(id) ? " is-changed" : "";
    const hint = hintOf(entry);
    if (field.type === "toggle") {
      const info = hint ? `<span class="st-info" title="${escapeHtml(hint)}"><svg class="icon" aria-hidden="true"><use href="#info"></use></svg></span>` : "";
      return `<label class="input st-check${changed}" data-field-id="${escapeHtml(id)}"><input type="checkbox" data-ctl="check"${value ? " checked" : ""}${field.locked ? " disabled" : ""}><span>${escapeHtml(labelOf(entry))}</span>${info}</label>`;
    }
    const range = type.rangeText?.(field, context) ?? "";
    const errorKey = errors.get(id);
    const block = type.block || field.multiline ? " st-row--block" : "";
    return `<div class="st-row${block}${changed}" data-field-id="${escapeHtml(id)}"><div class="st-label"><span>${escapeHtml(labelOf(entry))}</span>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}${range ? `<small>${escapeHtml(range)}</small>` : ""}${errorKey ? `<small class="st-error" data-inline-error>${escapeHtml(translate(errorKey))}</small>` : ""}</div><div class="st-control">${type.controlHtml(field, value, context)}</div></div>`;
  }

  function renderGroupCard(category, group) {
    const rows = group.entries.filter((entry) => state.isVisible(entry)).map(renderRow).join("");
    const title = category.groups.length > 1 && group.titleKey ? `<h3>${escapeHtml(translate(group.titleKey))}</h3>` : "";
    return `<section class="card st-card" data-group-id="${group.id}">${title}${rows}</section>`;
  }

  function renderGroupLink(category, group) {
    const changed = group.entries.some((entry) => state.isChanged(entry.id));
    return `<section class="card st-card"><button type="button" class="st-link-row${changed ? " is-changed" : ""}" data-act="group" data-group-id="${group.id}"><span class="st-label"><b>${escapeHtml(translate(group.titleKey))}</b><small>${escapeHtml(summaryOf(group, category.store))}</small></span><span>›</span></button></section>`;
  }

  function renderCrumbs(category, group) {
    const back = path.length ? `<button type="button" class="st-link" data-act="back" aria-label="${escapeHtml(translate("server.settings.back"))}">‹</button>` : "";
    let html = `<div class="st-crumbs">${back}<button type="button" class="st-link" data-act="home">${escapeHtml(translate("server.settings.root"))}</button>`;
    if (category) {
      const title = escapeHtml(translate(category.titleKey));
      html += ` › <button type="button" class="st-link" data-act="menu">${title} ▾</button>`;
    }
    if (group) html += ` › <b>${escapeHtml(translate(group.titleKey))}</b>`;
    if (isMenuOpen) {
      html += `<div class="card st-menu">${categories.map((item) => `<button type="button" data-act="category" data-category-id="${item.id}">${escapeHtml(translate(item.titleKey))}</button>`).join("")}</div>`;
    }
    return html + "</div>";
  }

  function renderToolbar(category, group) {
    const search = canSearch ? `<button type="button" class="input st-search" data-act="palette">${escapeHtml(translate("server.settings.search"))} <kbd>Ctrl K</kbd></button>` : "";
    return `<div class="st-toolbar">${renderCrumbs(category, group)}${search}</div>`;
  }

  function renderTiles() {
    const tiles = categories.map((category) => {
      const changed = category.groups.some((group) => group.entries.some((entry) => state.isChanged(entry.id)));
      return `<button type="button" class="card card-hover st-tile" data-act="category" data-category-id="${category.id}">${changed ? '<i class="st-dot"></i>' : ""}<b>${escapeHtml(translate(category.titleKey))}</b><span>${escapeHtml(summaryOf(category, category.store))}</span></button>`;
    }).join("");
    return `<div class="st-tiles">${tiles}</div>`;
  }

  function renderScreen() {
    const category = categories.find((item) => item.id === path[0]);
    if (!category) return renderToolbar() + renderTiles();
    const group = layout === "wide" ? null : category.groups.find((item) => item.id === path[1]);
    if (group) return renderToolbar(category, group) + `<div class="st-groups">${renderGroupCard(category, group)}</div>`;
    const cards = category.groups.map((item) => (item.presentation === "link" && layout !== "wide" ? renderGroupLink(category, item) : renderGroupCard(category, item))).join("");
    return renderToolbar(category) + `<div class="st-groups">${cards}</div>`;
  }

  function renderSaveBar() {
    const changedIds = state.getChangedIds();
    rootElement.classList.toggle("has-changes", changedIds.length > 0 && !demo);
    if (!changedIds.length || demo) {
      barElement.innerHTML = "";
      isBarVisible = false;
      return;
    }
    const diff = changedIds.map((id) => {
      const entry = fieldIndex.get(id);
      const type = fieldTypes[entry.field.type];
      const before = type.format(state.getSavedValue(id), entry.field, context);
      const after = type.format(state.getValue(id), entry.field, context);
      return `<div><b>${escapeHtml(labelOf(entry))}</b>: ${escapeHtml(before)} → ${escapeHtml(after)}</div>`;
    }).join("");
    const message = errors.size ? `<span class="st-error">${escapeHtml(translate("server.settings.fix_errors"))}</span>` : "";
    const saveLabel = translate(isSaving ? "server.settings.saving" : "server.settings.save");
    barElement.innerHTML = `${isDiffOpen ? `<div class="card st-diff">${diff}</div>` : ""}<div class="card st-savebar${isBarVisible ? "" : " is-entering"}"><button type="button" class="st-link" data-act="diff">${escapeHtml(translate("server.settings.changes", { count: changedIds.length }))} ▴</button>${message}<span class="spacer"></span><button type="button" class="btn" data-act="reset"${isSaving ? " disabled" : ""}>${escapeHtml(translate("server.settings.reset"))}</button><button type="button" class="btn btn--primary" data-act="save"${isSaving ? " disabled" : ""}>${escapeHtml(saveLabel)}</button></div>`;
    isBarVisible = true;
  }

  function captureFocus() {
    const active = document.activeElement;
    if (!active || !rootElement.contains(active)) return null;
    const row = active.closest("[data-field-id]");
    return row ? { id: row.dataset.fieldId, control: active.dataset.ctl } : null;
  }

  function restoreFocus(target) {
    if (!target) return;
    const row = [...rootElement.querySelectorAll("[data-field-id]")].find((item) => item.dataset.fieldId === target.id);
    row?.querySelector(target.control ? `[data-ctl="${target.control}"]` : "button, input, select, textarea")?.focus();
  }

  function applyReveal() {
    if (!pendingReveal) return;
    const { fieldId, groupId } = pendingReveal;
    pendingReveal = null;
    const element = [...rootElement.querySelectorAll(fieldId ? "[data-field-id]" : "[data-group-id]")].find((item) => (fieldId ? item.dataset.fieldId === fieldId : item.dataset.groupId === groupId));
    if (!element) return;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    element.classList.add("st-flash");
  }

  function mountSelects() {
    for (const instance of selectInstances) instance.destroy();
    selectInstances = [];
    for (const host of rootElement.querySelectorAll("[data-select]")) {
      const scope = host.closest("[data-field-id]");
      const entry = fieldIndex.get(scope.dataset.fieldId);
      const type = fieldTypes[entry.field.type];
      const config = type.selectConfig(entry.field, state.getValue(entry.id), context);
      const instance = createCustomSelect({
        root: host,
        ariaLabel: labelOf(entry),
        getKey: (item) => item.key,
        searchable: config.searchable !== false,
        searchPlaceholder: translate("common.search"),
        renderOption: (item) => {
          const node = document.createElement("span");
          node.className = "cselect__item";
          node.textContent = item.label;
          return node;
        },
        onChange: (item) => applyResult(entry.id, config.pick(item.key, host))
      });
      instance.setItems(config.items);
      instance.select(config.selected, { silent: true });
      host.querySelector(".cselect__value").dataset.placeholder = config.placeholder;
      selectInstances.push(instance);
    }
  }

  function render() {
    const focus = captureFocus();
    rootElement.innerHTML = renderScreen();
    mountSelects();
    renderSaveBar();
    restoreFocus(focus);
    applyReveal();
  }

  function showFieldError(fieldId, message) {
    const row = [...rootElement.querySelectorAll("[data-field-id]")].find((item) => item.dataset.fieldId === fieldId);
    const label = row?.querySelector(".st-label");
    if (!label) return;
    let element = label.querySelector("[data-inline-error]");
    if (!element) {
      element = document.createElement("small");
      element.className = "st-error";
      element.dataset.inlineError = "";
      label.appendChild(element);
    }
    element.textContent = message;
  }

  function openPalette() {
    if (!canSearch || isPaletteOpen()) return;
    if (!search.controller.open(search.tabId)) return;
    searchInput.value = "";
    renderHits("");
    searchInput.focus();
  }

  function findHits(query) {
    const needle = query.trim().toLowerCase();
    return [...fieldIndex.values()].filter((entry) => {
      if (!needle) return true;
      const haystack = [labelOf(entry), entry.field.key, translate(entry.category.titleKey), ...(entry.field.searchTerms ?? [])].join(" ").toLowerCase();
      return haystack.includes(needle);
    }).slice(0, 8);
  }

  function renderHits(query) {
    const hits = findHits(query);
    hitsElement.innerHTML = hits.length
      ? hits.map((entry) => `<button type="button" class="st-hit" data-act="goto" data-field-id="${escapeHtml(entry.id)}"><span>${escapeHtml(labelOf(entry))}</span><small>${escapeHtml(translate(entry.category.titleKey))}</small></button>`).join("")
      : `<div class="st-empty">${escapeHtml(translate("server.settings.no_results"))}</div>`;
  }

  function navigate(nextPath, { replace = false, dropModal = false } = {}) {
    path = nextPath;
    isMenuOpen = false;
    route.writePath(nextPath, { replace, dropModal });
    render();
  }

  function pathForEntry(entry) {
    return layout === "wide" || entry.group.presentation !== "link" ? [entry.category.id] : [entry.category.id, entry.group.id];
  }

  function goToField(fieldId) {
    const entry = fieldIndex.get(fieldId);
    if (!entry) return;
    const wasOpen = isPaletteOpen();
    if (wasOpen) search.controller.close({ updateUrl: false });
    pendingReveal = { fieldId };
    navigate(pathForEntry(entry), { replace: wasOpen, dropModal: wasOpen });
  }

  function goBack() {
    if (route.canGoBack()) route.goBack();
    else navigate(path.slice(0, -1), { replace: true });
  }

  function applyResult(fieldId, result) {
    if (result === undefined) return;
    if (result instanceof FieldError) {
      showFieldError(fieldId, translate(result.messageKey));
      return;
    }
    state.setValue(fieldId, result);
    errors.delete(fieldId);
    render();
  }

  async function save() {
    errors = state.validate();
    if (errors.size) {
      const first = fieldIndex.get([...errors.keys()][0]);
      pendingReveal = { fieldId: first.id };
      navigate(pathForEntry(first));
      return;
    }
    isSaving = true;
    renderSaveBar();
    try {
      await onSave(state.getChanges());
      state.commit();
      isDiffOpen = false;
    } catch (error) {
      console.error("[settings] save failed", error);
    }
    isSaving = false;
    render();
  }

  function handleClick(event) {
    const actionElement = event.target.closest("[data-act]");
    const action = actionElement?.dataset.act;
    if (isMenuOpen && action !== "menu") {
      isMenuOpen = false;
      if (!action) render();
    }
    if (!actionElement) return;
    const scope = actionElement.closest("[data-field-id]");
    const fieldId = scope?.dataset.fieldId;
    if (action === "category") return navigate([actionElement.dataset.categoryId]);
    if (action === "group") return navigate([path[0], actionElement.dataset.groupId]);
    if (action === "home") return navigate([]);
    if (action === "back") return goBack();
    if (action === "menu") {
      isMenuOpen = !isMenuOpen;
      return render();
    }
    if (action === "diff") {
      isDiffOpen = !isDiffOpen;
      return render();
    }
    if (action === "reset") {
      state.discard();
      errors = new Map();
      isDiffOpen = false;
      return render();
    }
    if (action === "save") return save();
    if (action === "palette") return openPalette();
    if (action === "goto") return goToField(fieldId);
    if (!fieldId) return;
    const entry = fieldIndex.get(fieldId);
    const type = fieldTypes[entry.field.type];
    applyResult(fieldId, type.onAction?.(entry.field, state.getValue(fieldId), actionElement, scope));
  }

  function handleChange(event) {
    const control = event.target.closest("[data-ctl]");
    const scope = control?.closest("[data-field-id]");
    if (!control || !scope) return;
    const entry = fieldIndex.get(scope.dataset.fieldId);
    const type = fieldTypes[entry.field.type];
    const result = type.onChange?.(entry.field, state.getValue(entry.id), control, scope);
    setTimeout(() => applyResult(entry.id, result), 0);
  }

  function handleInput(event) {
    if (event.target.matches("[data-settings-search]")) renderHits(event.target.value);
  }

  function handleKeydown(event) {
    const isShortcut = canSearch && (event.ctrlKey || event.metaKey) && (event.code === "KeyK" || event.key.toLowerCase() === "k");
    if (isShortcut && rootElement.getClientRects().length > 0) {
      event.preventDefault();
      event.stopPropagation();
      openPalette();
      return;
    }
    if (event.key === "Enter" && event.target.matches("[data-settings-search]")) {
      const [first] = findHits(event.target.value);
      if (first) goToField(first.id);
      return;
    }
    const control = event.target.closest?.("[data-ctl]");
    const scope = control?.closest("[data-field-id]");
    if (!control || !scope) return;
    const entry = fieldIndex.get(scope.dataset.fieldId);
    const type = fieldTypes[entry.field.type];
    applyResult(entry.id, type.onKey?.(entry.field, state.getValue(entry.id), control, event));
  }

  function clearDrag() {
    if (!dragState) return;
    dragState.chip.classList.remove("is-dragging");
    dragState.chip.style.transform = "";
    for (const item of dragState.scope.querySelectorAll(".is-drop-target")) item.classList.remove("is-drop-target");
    dragState = null;
  }

  function handlePointerDown(event) {
    const chip = event.target.closest("[data-sortable]");
    if (!chip || event.target.closest("[data-act]") || event.button > 0) return;
    const scope = chip.closest("[data-field-id]");
    dragState = { chip, scope, value: chip.dataset.value, startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, active: false, target: null };
    chip.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.active) {
      if (Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
      dragState.active = true;
      dragState.chip.classList.add("is-dragging");
    }
    dragState.chip.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    const over = [...dragState.scope.querySelectorAll("[data-sortable]")].find((item) => {
      if (item === dragState.chip) return false;
      const rect = item.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    for (const item of dragState.scope.querySelectorAll(".is-drop-target")) item.classList.remove("is-drop-target");
    over?.classList.add("is-drop-target");
    dragState.target = over?.dataset.value ?? null;
  }

  function handlePointerUp(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const { scope, value, target, active } = dragState;
    clearDrag();
    if (!active || target === null) return;
    const entry = fieldIndex.get(scope.dataset.fieldId);
    const type = fieldTypes[entry.field.type];
    applyResult(entry.id, type.onReorder?.(entry.field, state.getValue(entry.id), value, target));
  }

  function handleBeforeUnload(event) {
    if (demo || !state.getChangedIds().length) return;
    event.preventDefault();
    event.returnValue = "";
  }

  function applyLayout(width) {
    const next = width < LAYOUT_BREAKPOINTS.medium ? "compact" : width < LAYOUT_BREAKPOINTS.wide ? "medium" : "wide";
    if (next === layout) return;
    layout = next;
    rootElement.dataset.layout = next;
    portal.dataset.layout = next;
    if (isPaletteOpen()) search.controller.close();
    if (path[1] && next === "wide") pendingReveal = { groupId: path[1] };
    render();
  }

  const resizeObserver = new ResizeObserver((entries) => {
    const width = entries[0].contentRect.width;
    portal.hidden = width === 0;
    if (width > 0) applyLayout(width);
  });

  for (const target of [rootElement, portal]) {
    target.addEventListener("click", handleClick);
    target.addEventListener("change", handleChange);
    target.addEventListener("input", handleInput);
  }
  rootElement.addEventListener("pointerdown", handlePointerDown);
  rootElement.addEventListener("pointermove", handlePointerMove);
  rootElement.addEventListener("pointerup", handlePointerUp);
  rootElement.addEventListener("pointercancel", clearDrag);
  search?.panel.addEventListener("click", handleClick);
  search?.panel.addEventListener("input", handleInput);
  document.addEventListener("keydown", handleKeydown, true);
  window.addEventListener("beforeunload", handleBeforeUnload);

  path = normalizePath(route.readPath());
  applyLayout(rootElement.clientWidth || LAYOUT_BREAKPOINTS.wide);
  resizeObserver.observe(rootElement);

  return {
    destroy() {
      resizeObserver.disconnect();
      route.destroy();
      for (const instance of selectInstances) instance.destroy();
      document.removeEventListener("keydown", handleKeydown, true);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      rootElement.removeEventListener("click", handleClick);
      rootElement.removeEventListener("change", handleChange);
      rootElement.removeEventListener("input", handleInput);
      rootElement.removeEventListener("pointerdown", handlePointerDown);
      rootElement.removeEventListener("pointermove", handlePointerMove);
      rootElement.removeEventListener("pointerup", handlePointerUp);
      rootElement.removeEventListener("pointercancel", clearDrag);
      search?.panel.removeEventListener("click", handleClick);
      search?.panel.removeEventListener("input", handleInput);
      portal.remove();
      rootElement.innerHTML = "";
    }
  };
}
