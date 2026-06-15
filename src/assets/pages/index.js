import { $ } from "@/lib/index.js";
import { apiPublic } from "@/services/index.js";

export async function initHomePage() {
  const result = await apiPublic("public_stats", {}, {
    cacheTtlMs: 30_000,
    requestTimeoutMs: 8_000
  }).catch((e) => {
    console.error("[home] Failed to fetch stats:", e);
    return null;
  });

  if (!result) return;

  document.querySelectorAll("[data-stat]").forEach((el) => {
    const key = el.dataset.stat;

    if (key === "years") {
      el.textContent = "2023-" + new Date().getFullYear();
      return;
    }

    el.textContent = result[key] ?? "0";
  });

  $("#cardSection").classList.remove("loading");
}