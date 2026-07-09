import { $ } from "../dom.js";

export function initDropdown({ button, dropdown, onAction }) {
  if (!button || !dropdown) return;

  const originalParent = dropdown.parentNode;
  const originalNextSibling = dropdown.nextSibling;

  let rafId = null;

  const reposition = () => {
    const btnRect = button.getBoundingClientRect();
    const dropdownRect = dropdown.getBoundingClientRect();

    let top = btnRect.bottom + 8;
    let left = btnRect.left;

    if (top + dropdownRect.height > window.innerHeight) {
      top = btnRect.top - dropdownRect.height - 8;
    }
    if (left + dropdownRect.width > window.innerWidth) {
      left = window.innerWidth - dropdownRect.width - 8;
    }
    if (left < 8) left = 8;
    if (top < 8) top = 8;

    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${left}px`;
  };

  const loop = () => {
    reposition();
    rafId = requestAnimationFrame(loop);
  };

  const handleOutsideClick = (e) => {
    if (dropdown.contains(e.target) || button.contains(e.target)) return;
    close();
  };

  const close = () => {
    dropdown.classList.remove("is-open");
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (dropdown.parentNode === document.body) {
      if (originalNextSibling) {
        originalParent.insertBefore(dropdown, originalNextSibling);
      } else {
        originalParent.appendChild(dropdown);
      }
    }
    button.setAttribute("aria-expanded", "false");
  };

  const open = () => {
    document.body.appendChild(dropdown);

    dropdown.style.visibility = "hidden";
    dropdown.classList.add("is-open");

    reposition();

    dropdown.style.visibility = "visible";
    button.setAttribute("aria-expanded", "true");

    loop();
  };

  button.addEventListener("click", () => {
    dropdown.classList.contains("is-open") ? close() : open();
  });

  document.addEventListener("click", handleOutsideClick, true);

  dropdown.addEventListener("click", async (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action) {
      await onAction?.(action);
    }
  });
}