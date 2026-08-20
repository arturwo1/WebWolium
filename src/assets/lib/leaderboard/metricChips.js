import { METRICS } from "./leaderboardRow.js";

export function buildMetricChips(containerEl, activeMetric, translate, onSelect) {
  containerEl.innerHTML = "";
  for (const m of METRICS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "news-chip lb-metric-chip";
    btn.dataset.metric = m.key;
    btn.textContent = translate(m.i18nKey);
    if (m.key === activeMetric) btn.classList.add("is-active");
    btn.addEventListener("click", () => {
      containerEl.querySelectorAll(".lb-metric-chip").forEach(b =>
        b.classList.toggle("is-active", b.dataset.metric === m.key)
      );
      onSelect(m.key);
    });
    containerEl.appendChild(btn);
  }
}