import { $ } from "@/lib/index.js";

export async function initHomePage(sb) {
  const table = "public_stats";

  const { data, error } = await sb
    .from(table)
    .select("key, value");

  if (error) {
    console.error("[home] Failed to fetch stats:", error);
    return;
  }

  const result = {};
  for (const row of data) {
    result[row.key] = row.value;
  }

  document.querySelectorAll("[data-stat]").forEach((el) => {
    const key = el.dataset.stat;

    if (key === "years") {
      el.textContent = "2021-" + new Date().getFullYear();
      return;
    }

    el.textContent = result[key] ?? "0";
  });

  $("#cardSection").classList.remove("loading");
}