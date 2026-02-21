import { $ } from "../dom.js";

export function showGate() {
  $("#authGate")?.removeAttribute("hidden");
  $("#appShell")?.setAttribute("hidden", "hidden");
}

export function showShell() {
  $("#authGate")?.setAttribute("hidden", "hidden");
  $("#appShell")?.removeAttribute("hidden");
}
