const COLLAPSE_KEY = "wolium:collapsed_sections";

function getCollapsed() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "[]")); }
  catch { return new Set(); }
}

function setCollapsed(set) {
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set]));
}

export function initCollapsible(container, defaultCollapsed = []) {
  const collapsed = getCollapsed();

  const isFirstVisit = !localStorage.getItem(COLLAPSE_KEY);
  if (isFirstVisit) {
    defaultCollapsed.forEach(k => collapsed.add(k));
    setCollapsed(collapsed);
  }

  container.querySelectorAll(".privacy-section").forEach(section => {
    const key = section.dataset.sectionKey;
    if (!key) return;

    const title = section.querySelector(".privacy-section__title");
    const body = section.querySelector(".privacy-flags, .server-section-body");
    if (!title || !body) return;

    title.style.cursor = "pointer";
    title.style.userSelect = "none";

    function apply(animate = false) {
      const isCollapsed = collapsed.has(key);
      if (animate) {
        body.style.transition = "opacity .14s ease, max-height .18s ease";
      }
      body.style.overflow = "hidden";
      body.style.maxHeight = isCollapsed ? "0" : "9999px";
      body.style.opacity = isCollapsed ? "0" : "1";
    }

    apply(false);

    title.addEventListener("click", () => {
      if (collapsed.has(key)) collapsed.delete(key);
      else collapsed.add(key);
      setCollapsed(collapsed);
      apply(true);
    });
  });
}