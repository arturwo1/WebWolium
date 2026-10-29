let uid = 0;

export function moveIndex(current, key, count) {
  if (count <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return current < 0 ? 0 : Math.min(current + 1, count - 1);
  if (key === "ArrowUp") return current < 0 ? count - 1 : Math.max(current - 1, 0);
  return current;
}

const MODAL_QUERY = "(max-width: 700px)";
const POPUP_GAP = 6;
const POPUP_MARGIN = 12;
const POPUP_MAX_HEIGHT = 380;

export function createCustomSelect({
  root,
  renderOption,
  getKey,
  onChange = null,
  onFooter = null,
  ariaLabel = "",
  searchable = true,
  searchPlaceholder = "",
  getSearchText = null
}) {
  if (!root) return null;

  const id = `cselect-${++uid}`;

  const make = (tag, className) => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  };

  const wrap = make("div", "cselect");
  const trigger = make("button", "cselect__trigger");
  const valueEl = make("span", "cselect__value");
  const caret = make("span", "cselect__caret");
  const popup = make("div", "cselect__popup");
  const search = make("input", "input cselect__search");
  const list = make("div", "cselect__list");
  const footer = make("button", "cselect__footer");
  const backdrop = make("div", "cselect__backdrop");

  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", `${id}-list`);
  if (ariaLabel) trigger.setAttribute("aria-label", ariaLabel);
  caret.setAttribute("aria-hidden", "true");
  popup.hidden = true;
  search.type = "search";
  search.id = `${id}-search`;
  search.name = `${id}-search`;
  search.autocomplete = "off";
  search.hidden = true;
  search.placeholder = searchPlaceholder;
  if (searchPlaceholder) search.setAttribute("aria-label", searchPlaceholder);
  list.id = `${id}-list`;
  list.setAttribute("role", "listbox");
  if (ariaLabel) list.setAttribute("aria-label", ariaLabel);
  footer.type = "button";
  footer.id = `${id}-footer`;
  footer.hidden = true;

  trigger.append(valueEl, caret);
  popup.append(search, list, footer);
  wrap.append(trigger, popup);
  root.replaceChildren(wrap);

  let allItems = [];
  let items = [];
  let query = "";
  let selected = null;
  let footerState = null;
  let searchCache = new Map();
  let optionEls = [];
  let isOpen = false;
  let isModal = false;
  let active = -1;

  const indexOfKey = (key) => items.findIndex((item) => getKey(item) === key);
  const selectedItem = () => allItems.find((item) => getKey(item) === selected) ?? null;
  const stops = () => items.length + (footerState ? 1 : 0);
  const hasSearch = () => searchable;
  function searchText(item) {
    const key = getKey(item);
    if (!searchCache.has(key)) {
      const source = getSearchText ? getSearchText(item) : renderOption(item, { selected: false, trigger: false }).textContent;
      searchCache.set(key, String(source ?? "").toLowerCase());
    }
    return searchCache.get(key);
  }

  function loadMoreForSearch() {
    if (!isOpen || !query.trim() || items.length > 0 || !footerState || footerState.busy) return;
    onFooter?.();
  }

  function applyFilter() {
    const needle = query.trim().toLowerCase();
    items = needle ? allItems.filter((item) => searchText(item).includes(needle)) : allItems.slice();
  }

  function renderTrigger() {
    const item = selectedItem();
    valueEl.replaceChildren(...(item ? [renderOption(item, { selected: true, trigger: true })] : []));
  }

  function markSelection() {
    optionEls.forEach((option, index) => {
      const isSelected = getKey(items[index]) === selected;
      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-selected", isSelected ? "true" : "false");
    });
  }

  function renderFooter() {
    footer.hidden = !footerState;
    if (!footerState) return;
    footer.textContent = footerState.text ?? "";
    footer.disabled = Boolean(footerState.busy);
    footer.setAttribute("aria-busy", footerState.busy ? "true" : "false");
  }

  function setActive(index, scroll = true) {
    active = index;

    optionEls.forEach((option, i) => option.classList.toggle("is-active", i === index));
    footer.classList.toggle("is-active", Boolean(footerState) && index === items.length);

    let target = null;
    if (index >= 0 && index < optionEls.length) target = optionEls[index];
    else if (footerState && index === items.length) target = footer;

    if (target) trigger.setAttribute("aria-activedescendant", target.id);
    else trigger.removeAttribute("aria-activedescendant");

    if (scroll && target && target !== footer) reveal(target);
  }

  function reveal(option) {
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }

  function renderList() {
    const top = list.scrollTop;

    optionEls = items.map((item, index) => {
      const option = make("div", "cselect__option");
      option.id = `${id}-opt-${index}`;
      option.setAttribute("role", "option");
      option.append(renderOption(item, { selected: false, trigger: false }));
      option.addEventListener("click", () => choose(index));
      option.addEventListener("mouseenter", () => setActive(index, false));
      return option;
    });

    list.replaceChildren(...optionEls);
    markSelection();
    list.scrollTop = top;
    if (isOpen) setActive(Math.min(active, stops() - 1), false);
  }

  function positionPopup() {
    if (isModal) {
      popup.removeAttribute("style");
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - POPUP_MARGIN;
    const above = rect.top - POPUP_MARGIN;
    const openUp = below < 200 && above > below;
    const room = Math.max(140, openUp ? above : below);
    Object.assign(popup.style, {
      position: "fixed",
      left: `${rect.left}px`,
      right: "auto",
      width: `${rect.width}px`,
      maxHeight: `${Math.min(POPUP_MAX_HEIGHT, room)}px`,
      top: openUp ? "auto" : `${rect.bottom + POPUP_GAP}px`,
      bottom: openUp ? `${window.innerHeight - rect.top + POPUP_GAP}px` : "auto"
    });
  }

  function handleScroll(event) {
    if (!isOpen || isModal || popup.contains(event.target)) return;
    positionPopup();
  }

  function handleResize() {
    close();
  }

  function open() {
    if (isOpen || allItems.length === 0 && !footerState) return;
    query = "";
    search.value = "";
    search.hidden = !hasSearch();
    applyFilter();
    renderList();

    isModal = Boolean(window.matchMedia?.(MODAL_QUERY).matches);
    if (isModal) {
      backdrop.append(popup);
      document.body.append(backdrop);
    } else {
      document.body.append(popup);
    }

    isOpen = true;
    popup.hidden = false;
    positionPopup();
    wrap.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    setActive(Math.max(indexOfKey(selected), 0));

    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);

    const isTouch = window.matchMedia?.("(pointer: coarse)").matches;
    if (!search.hidden && !isTouch) search.focus();
  }

  function close({ focus = false } = {}) {
    if (!isOpen) return;
    isOpen = false;
    popup.hidden = true;
    popup.removeAttribute("style");
    wrap.append(popup);
    backdrop.remove();
    isModal = false;
    wrap.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-activedescendant");
    active = -1;
    window.removeEventListener("scroll", handleScroll, true);
    window.removeEventListener("resize", handleResize);
    if (focus) trigger.focus?.();
  }

  function select(key, { silent = false } = {}) {
    selected = key;
    renderTrigger();
    markSelection();
    const item = selectedItem();
    if (item && !silent) onChange?.(item);
  }

  function choose(index) {
    if (index === items.length && footerState) {
      if (!footerState.busy) onFooter?.();
      return;
    }
    const item = items[index];
    if (!item) return;
    select(getKey(item));
    close({ focus: true });
  }

  function handleKeydown(e) {
    const key = e.key;
    const inSearch = e.target === search;

    if (!isOpen) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        e.preventDefault();
        open();
      }
      return;
    }

    if (key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close({ focus: true });
      return;
    }

    if (key === "Tab") {
      close();
      return;
    }

    if (key === " " && inSearch) return;

    if (key === "Enter" || key === " ") {
      e.preventDefault();
      if (active >= 0) choose(active);
      return;
    }

    if (inSearch && (key === "Home" || key === "End")) return;

    if (key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
      e.preventDefault();
      setActive(moveIndex(active, key, stops()));
    }
  }

  function handleKeyup(e) {
    if (e.key === " " && e.target !== search) e.preventDefault();
  }

  const handlePointerDown = (e) => {
    if (isOpen && !wrap.contains(e.target) && !popup.contains(e.target)) close();
  };

  trigger.addEventListener("click", () => {
    if (isOpen) close();
    else open();
  });

  footer.addEventListener("click", () => choose(items.length));
  footer.addEventListener("mouseenter", () => setActive(items.length, false));

  search.addEventListener("input", () => {
    query = search.value;
    applyFilter();
    renderList();
    setActive(items.length ? 0 : -1);
    loadMoreForSearch();
  });

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  trigger.addEventListener("keydown", handleKeydown);
  popup.addEventListener("keydown", handleKeydown);
  trigger.addEventListener("keyup", handleKeyup);
  popup.addEventListener("keyup", handleKeyup);
  document.addEventListener("pointerdown", handlePointerDown);

  return {
    setItems(next) {
      allItems = Array.isArray(next) ? next : [];
      searchCache = new Map();
      if (!allItems.some((item) => getKey(item) === selected)) selected = null;
      applyFilter();
      renderTrigger();
      renderList();
      loadMoreForSearch();
    },
    setFooter(state) {
      footerState = state;
      renderFooter();
      if (isOpen) setActive(Math.min(active, stops() - 1), false);
      loadMoreForSearch();
    },
    select,
    refresh() {
      searchCache = new Map();
      applyFilter();
      renderTrigger();
      renderList();
      renderFooter();
    },
    destroy() {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
      popup.remove();
      backdrop.remove();
    }
  };
}
