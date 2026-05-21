import { $ } from "../dom.js";
import { lsGet } from "../storage.js";

export function initDrawer() {
  const sidebar = $("#sidebar");
  const overlay = $("#overlay");
  const btnMenu = $("#btnMenu");
  const btnClose = $("#btnClose");

  const btnNews = $("#btnNews");
  const newsLast = lsGet("newsLast");

  if (!sidebar) return;

  let isOpen = false;
  let isDragging = false;
  let startX = 0;
  let currentX = 0;
  let baseX = 0;

  const getSidebarWidth = () => sidebar.offsetWidth || 320;
  const isMobile = () => window.matchMedia("(max-width: 860px)").matches;

  const setTranslate = (x) => {
    sidebar.style.transform = `translateX(${x}px)`;
  };

  const open = () => {
    isOpen = true;
    sidebar.classList.add("is-open");
    overlay?.classList.add("is-on");
    sidebar.style.transform = "";
    sidebar.style.transition = "";
  };

  const close = () => {
    isOpen = false;
    sidebar.classList.remove("is-open");
    overlay?.classList.remove("is-on");
    sidebar.style.transform = "";
    sidebar.style.transition = "";
  };

  btnMenu?.addEventListener("click", open);
  btnClose?.addEventListener("click", close);
  overlay?.addEventListener("click", close);

  document.addEventListener("touchstart", (e) => {
    if (!isMobile()) return;

    const touchX = e.touches[0].clientX;
    const width = getSidebarWidth();

    const touchedSidebar = e.target.closest?.("#sidebar");

    if (isOpen && touchedSidebar) {
      isDragging = true;
      startX = touchX;
      currentX = touchX;
      baseX = 0;
      sidebar.style.transition = "none";
      return;
    }

    if (!isOpen && touchX <= 24) {
      isDragging = true;
      startX = touchX;
      currentX = touchX;
      baseX = -width;
      sidebar.classList.add("is-open");
      overlay?.classList.add("is-on");
      sidebar.style.transition = "none";
      setTranslate(baseX);
    }
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!isDragging || !isMobile()) return;

    currentX = e.touches[0].clientX;
    const width = getSidebarWidth();
    const deltaX = currentX - startX;

    let nextX = baseX + deltaX;
    if (nextX > 0) nextX = 0;
    if (nextX < -width) nextX = -width;

    setTranslate(nextX);
  }, { passive: true });

  document.addEventListener("touchend", () => {
    if (!isDragging || !isMobile()) return;

    const width = getSidebarWidth();
    const deltaX = currentX - startX;
    const threshold = width * 0.3;

    sidebar.style.transition = "";

    if (isOpen) {
      if (deltaX < -threshold) {
        close();
      } else {
        open();
      }
    } else {
      if (deltaX > threshold) {
        open();
      } else {
        close();
      }
    }

    isDragging = false;
    startX = 0;
    currentX = 0;
    baseX = 0;
  });

  if (btnNews) {
    const total = parseInt(btnNews.dataset.newsCount ?? "0", 10);
    const seen = parseInt(newsLast ?? 0, 10) || 0;
    const missed = Math.max(0, total - seen);

    if (missed > 0) {
      const badge = document.createElement("span");
      badge.className = "nav__badge";
      badge.textContent = `+${missed}`;
      btnNews.appendChild(badge);
    }
  }
}