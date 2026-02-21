import { $ } from "../dom.js";

export function initMobileDrawer() {
  const sidebar = $("#sidebar");
  const overlay = $("#overlay");
  const btnMenu = $("#btnMenu");
  const btnClose = $("#btnClose");

  const open = () => {
    sidebar?.classList.add("is-open");
    overlay?.classList.add("is-on");
  };
  const close = () => {
    sidebar?.classList.remove("is-open");
    overlay?.classList.remove("is-on");
  };

  btnMenu?.addEventListener("click", open);
  btnClose?.addEventListener("click", close);
  overlay?.addEventListener("click", close);
}
