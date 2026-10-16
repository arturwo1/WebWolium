let uid = 0;

export function moveIndex(current, key, count) {
  if (count <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return current < 0 ? 0 : Math.min(current + 1, count - 1);
  if (key === "ArrowUp") return current < 0 ? count - 1 : Math.max(current - 1, 0);
  return current;
}

export function createCustomSelect({ root, renderOption, getKey, onChange = null, onFooter = null, ariaLabel = "" }) {
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
  const list = make("div", "cselect__list");
  const footer = make("button", "cselect__footer");

  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", `${id}-list`);
  if (ariaLabel) trigger.setAttribute("aria-label", ariaLabel);
  caret.setAttribute("aria-hidden", "true");
  popup.hidden = true;
  list.id = `${id}-list`;
  list.setAttribute("role", "listbox");
  if (ariaLabel) list.setAttribute("aria-label", ariaLabel);
  footer.type = "button";
  footer.id = `${id}-footer`;
  footer.hidden = true;

  trigger.append(valueEl, caret);
  popup.append(list, footer);
  wrap.append(trigger, popup);
  root.replaceChildren(wrap);

  let items = [];
  let selected = null;
  let footerState = null;
  let optionEls = [];
  let isOpen = false;
  let active = -1;

  const indexOfKey = (key) => items.findIndex((item) => getKey(item) === key);
  const selectedItem = () => {
    const index = indexOfKey(selected);
    return index >= 0 ? items[index] : null;
  };
  const stops = () => items.length + (footerState ? 1 : 0);

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

  function open() {
    if (isOpen || stops() === 0) return;
    isOpen = true;
    popup.hidden = false;
    wrap.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    setActive(Math.max(indexOfKey(selected), 0));
  }

  function close({ focus = false } = {}) {
    if (!isOpen) return;
    isOpen = false;
    popup.hidden = true;
    wrap.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-activedescendant");
    active = -1;
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

  trigger.addEventListener("click", () => {
    if (isOpen) close();
    else open();
  });

  footer.addEventListener("click", () => choose(items.length));
  footer.addEventListener("mouseenter", () => setActive(items.length, false));

  wrap.addEventListener("keydown", (e) => {
    const key = e.key;

    if (!isOpen) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        e.preventDefault();
        open();
      }
      return;
    }

    if (key === "Escape") {
      e.preventDefault();
      close({ focus: true });
      return;
    }

    if (key === "Tab") {
      close();
      return;
    }

    if (key === "Enter" || key === " ") {
      e.preventDefault();
      if (active >= 0) choose(active);
      return;
    }

    if (key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
      e.preventDefault();
      setActive(moveIndex(active, key, stops()));
    }
  });

  wrap.addEventListener("keyup", (e) => {
    if (e.key === " ") e.preventDefault();
  });

  document.addEventListener("pointerdown", (e) => {
    if (isOpen && !wrap.contains(e.target)) close();
  });

  return {
    setItems(next) {
      items = Array.isArray(next) ? next : [];
      if (indexOfKey(selected) < 0) selected = null;
      renderTrigger();
      renderList();
    },
    setFooter(state) {
      footerState = state;
      renderFooter();
      if (isOpen) setActive(Math.min(active, stops() - 1), false);
    },
    select,
    refresh() {
      renderTrigger();
      renderList();
      renderFooter();
    }
  };
}
