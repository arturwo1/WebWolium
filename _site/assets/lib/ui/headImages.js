import { img } from "../../images.js";

export function bindHeadImages() {
  const icon = img("Wolium.png");
  if (!icon) return;

  const linkIcon = document.querySelector("[data-dyn-icon]");
  if (linkIcon) linkIcon.href = icon;

  const og = document.querySelector("[data-dyn-og]");
  if (og) og.setAttribute("content", icon);

  const tw = document.querySelector("[data-dyn-tw]");
  if (tw) tw.setAttribute("content", icon);
}
