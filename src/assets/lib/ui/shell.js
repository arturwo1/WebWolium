import { $ } from "../dom.js";

function nextFrame(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

export function showGate() {
  const gate = $("#authGate");
  const shell = $("#appShell");

  shell?.setAttribute("hidden", "hidden");

  if (!gate) return;

  gate.removeAttribute("hidden");
  gate.classList.add("is-mounted");
  gate.classList.remove("is-leaving");

  nextFrame(() => {
    gate.classList.add("is-visible");
  });
}

export function showShell() {
  const gate = $("#authGate");
  const shell = $("#appShell");

  shell?.removeAttribute("hidden");

  if (!gate || gate.hasAttribute("hidden")) return;

  gate.classList.remove("is-visible");
  gate.classList.add("is-leaving");

  const done = () => {
    gate.setAttribute("hidden", "hidden");
    gate.classList.remove("is-mounted", "is-leaving");
  };

  gate.addEventListener("transitionend", done, { once: true });
  setTimeout(done, 460);
}