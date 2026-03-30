import { $ } from "../dom.js";

export function initUserDropdown({ onLogout } = {}) {
  const btnAvatar = $("#btnAvatar");
  const userDropdown = $("#userDropdown");

  if (!btnAvatar || !userDropdown) return;

  const close = () => {
    userDropdown.classList.remove("is-open");
    btnAvatar.setAttribute("aria-expanded", "false");
  };

  btnAvatar.addEventListener("click", (e) => {
    e.stopPropagation();
    const openNow = userDropdown.classList.contains("is-open");
    close();
    userDropdown.classList.toggle("is-open", !openNow);
    btnAvatar.setAttribute("aria-expanded", String(!openNow));
  });

  document.addEventListener("click", close);

  userDropdown.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (btn?.dataset?.action === "logout") {
      await onLogout?.();
    }
  });
}
