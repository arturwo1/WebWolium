import { $, $$, t, formatNumber, formatDuration } from "@/lib/index.js";
import { apiPublic } from "@/services/index.js";
import { createRng } from "@/lib/demo/rng.js";
import { generateFakeProfileData } from "@/lib/demo/fakeProfile.js";
import { generateFakeServersData } from "@/lib/demo/fakeServers.js";
import { generateFakeServerAnalytics, generateFakeServerConfig } from "@/lib/demo/fakeServer.js";
import { generateFakeAccountSettingsState } from "@/lib/demo/fakeAccountSettings.js";
import { generateFakeLeaderboardEntries } from "@/lib/demo/fakeLeaderboard.js";
import { createFakeChartQueue, BASE_DAYS } from "@/lib/demo/fakeChartData.js";
import { applyProfileDisplayData } from "@/pages/profile.js";
import { createServerListController } from "@/lib/servers/serverListController.js";
import { applyServerAnalyticsData } from "@/lib/server/serverAnalytics.js";
import { buildServerSettingsForm } from "@/lib/server/settingsForm.js";
import { buildAccountSettingsForm, syncAccountSettingsInputs, applyAccountSettingsPreset } from "@/lib/settings/accountSettingsForm.js"
import { buildRow, fmtValue, METRICS } from "@/lib/leaderboard/leaderboardRow.js";
import { buildMetricChips } from "@/lib/leaderboard/metricChips.js";
import { initChart } from "@/lib/chart/chart.js";
import { initVoidField } from "@/lib/ui/voidField.js";
import { initVoidFly } from "@/lib/ui/voidFly.js";

initVoidField();
let voidFly = null;

const demoFormatters = { number: formatNumber, duration: formatDuration };

function hasSpriteSymbol(id) {
  if (!id) return false;
  return !!document.getElementById(String(id));
}

function initProfileDemoPlaceholder(root) {
  const data = generateFakeProfileData(Date.now() + Math.floor(Math.random() * 1e6));
  applyProfileDisplayData(root, data, { interactive: false });
}

function initServersDemoPlaceholder(root) {
  const data = generateFakeServersData(
    createRng(Date.now() + Math.floor(Math.random() * 1e6)),
    { translate: t }
  );
  const controller = createServerListController(root, { interactive: false, emptyMessages: false });
  controller.setGuilds(data.guilds);
}

function initServerDemoPlaceholder(root) {
  const data = generateFakeServerAnalytics(createRng(Date.now() + Math.floor(Math.random() * 1e6)));
  applyServerAnalyticsData(root, data, t, hasSpriteSymbol);
}

function initSettingsDemoPlaceholder(root) {
  const { config, channels } = generateFakeServerConfig(createRng(Date.now() + Math.floor(Math.random() * 1e6)));
  const sectionsEl = root.querySelector('[data-field="settings-sections"]');
  if (!sectionsEl) return;
  buildServerSettingsForm(sectionsEl, config, channels, t);
  root.querySelector('[data-field="settings-card"]')?.classList.remove("loading");
}

function initAccountSettingsDemoPlaceholder(root) {
  let state = generateFakeAccountSettingsState(createRng(Date.now() + Math.floor(Math.random() * 1e6)));

  const sectionsEl = root.querySelector('[data-field="sections"]');
  if (!sectionsEl) return;

  buildAccountSettingsForm(sectionsEl, state, t, (flagKey, checked) => {
    state[flagKey] = checked;
  });

  root.querySelectorAll('[data-field="preset"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      state = applyAccountSettingsPreset(btn.dataset.preset, state);
      syncAccountSettingsInputs(sectionsEl, state);
    });
  });
}

function initLeaderboardDemoPlaceholder(root) {
  const state = { metric: METRICS[0].key, scope: "world" };

  const chipsEl = root.querySelector('[data-field="metric-chips"]');
  const listEl = root.querySelector('[data-field="list"]');
  const totalEl = root.querySelector('[data-field="total"]');
  const subtitleEl = root.querySelector('[data-field="subtitle"]');
  const scopeButtons = root.querySelectorAll('[data-field="scope-btn"]');

  function render() {
    const rng = createRng(Date.now() + Math.floor(Math.random() * 1e6));
    const isServerScope = state.scope === "top_servers";
    const res = generateFakeLeaderboardEntries(rng, { scope: state.scope });

    totalEl.textContent = `${res.total_users.toLocaleString()} ${isServerScope ? t("leaderboard.unit_servers") : t("leaderboard.unit_users")}`;
    totalEl.classList.remove("skeleton");

    const scopeLabel = isServerScope ? t("leaderboard.scope_top_servers") : t("leaderboard.scope_world");
    const metricLabel = t(METRICS.find(m => m.key === state.metric)?.i18nKey ?? state.metric);
    subtitleEl.textContent = `${scopeLabel} · ${metricLabel} · ${fmtValue(res.total_value, state.metric, demoFormatters)}`;
    subtitleEl.classList.remove("skeleton");

    listEl.innerHTML = "";
    for (const entry of res.entries) {
      listEl.appendChild(buildRow(entry, { isServerScope, metricKey: state.metric, interactive: false }, t, demoFormatters));
    }
  }

  buildMetricChips(chipsEl, state.metric, t, (metricKey) => {
    state.metric = metricKey;
    render();
  });

  scopeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.scope = btn.dataset.scope;
      scopeButtons.forEach(b => b.classList.toggle("is-active", b === btn));
      render();
    });
  });

  render();
}

function initChartDemoPlaceholder(root) {
  const fakeQueue = createFakeChartQueue(createRng(Date.now() + Math.floor(Math.random() * 1e6)));

  const controller = initChart(fakeQueue, {
    root,
    guildId: "demo-guild",
    defaultDays: BASE_DAYS,
    alwaysVisible: true,
    viewer: { name: "Demo User", avatar: null },
  });

  if (!controller) return;

  const membersTab = root.querySelector('[data-field="members-tab"]');
  const scopeButtons = root.querySelectorAll('[data-field="scope-btn"]');
  let scope = "profile";

  function reprefixTabs() {
    root.querySelectorAll("[data-chart-type]").forEach((tab) => {
      const short = tab.getAttribute("data-chart-type").replace(/^user_|^guild_/, "");
      tab.setAttribute("data-chart-type", short === "members" ? "guild_members" : `${scope === "server" ? "guild" : "user"}_${short}`);
    });
  }

  reprefixTabs();

  scopeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      scope = btn.dataset.scope;
      scopeButtons.forEach((b) => b.classList.toggle("is-active", b === btn));
      membersTab.hidden = scope !== "server";

      if (scope !== "server" && membersTab.classList.contains("is-active")) {
        const messagesTab = root.querySelector('[data-chart-type="user_messages"], [data-chart-type="guild_messages"]');
        messagesTab?.click();
      }

      reprefixTabs();
      controller.setType(root.querySelector(".modal__tab.is-active")?.getAttribute("data-chart-type") || "user_messages");
    });
  });
}

const trackDragStates = new WeakMap();
const carouselRegistry = [];

function getDragState(track) {
  let state = trackDragStates.get(track);
  if (!state) {
    state = { isDown: false, startScrollLeft: 0 };
    trackDragStates.set(track, state);
  }
  return state;
}

function isTrackVisible(track) {
  return track.offsetParent !== null && track.getBoundingClientRect().width > 0;
}

function positionCarouselToFirstReal(entry) {
  const { track, allSlidesEls, firstRealIndex } = entry;
  if (!isTrackVisible(track)) return false;

  const slide = allSlidesEls[firstRealIndex];
  if (!slide) return false;

  const left = slide.offsetLeft - track.offsetLeft;

  const prevBehavior = track.style.scrollBehavior;
  track.style.scrollBehavior = "auto";
  track.scrollLeft = left;
  requestAnimationFrame(() => {
    track.style.scrollBehavior = prevBehavior || "";
  });

  entry.positioned = true;
  return true;
}

function repositionVisibleCarousels(scope) {
  const root = scope || document;
  for (const entry of carouselRegistry) {
    if (entry.positioned) continue;
    if (!root.contains(entry.track)) continue;
    positionCarouselToFirstReal(entry);
  }
}

function setupInfiniteCarousels() {
  document.querySelectorAll(".home-carousel[data-carousel-infinite]").forEach((carousel) => {
    const track = carousel.querySelector("[data-carousel-track]");
    if (!track) return;

    const realSlides = Array.from(track.querySelectorAll("[data-carousel-slide]"));
    if (realSlides.length < 2) return;

    const firstClone = realSlides[0].cloneNode(true);
    const lastClone = realSlides[realSlides.length - 1].cloneNode(true);
    firstClone.setAttribute("data-carousel-clone", "of-first");
    lastClone.setAttribute("data-carousel-clone", "of-last");
    firstClone.querySelectorAll("[data-modal-trigger],[data-tooltip-trigger],[data-spoiler-trigger],[data-accordion-trigger]").forEach((el) => el.setAttribute("inert", ""));
    lastClone.querySelectorAll("[data-modal-trigger],[data-tooltip-trigger],[data-spoiler-trigger],[data-accordion-trigger]").forEach((el) => el.setAttribute("inert", ""));

    track.insertBefore(lastClone, realSlides[0]);
    track.appendChild(firstClone);
    voidFly?.observe(firstClone);
    voidFly?.observe(lastClone);

    const allSlidesEls = Array.from(track.querySelectorAll("[data-carousel-slide]"));
    const firstRealIndex = 1;
    const lastRealIndex = allSlidesEls.length - 2;

    function getLoopWidth() {
      const realStart = allSlidesEls[firstRealIndex];
      const cloneOfFirst = allSlidesEls[allSlidesEls.length - 1];
      return (cloneOfFirst.offsetLeft - track.offsetLeft) - (realStart.offsetLeft - track.offsetLeft);
    }

    const entry = { track, allSlidesEls, firstRealIndex, positioned: false };
    carouselRegistry.push(entry);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        positionCarouselToFirstReal(entry);
      });
    });

    let isTeleporting = false;

    track.addEventListener(
      "scroll",
      () => {
        if (isTeleporting) return;
        if (!entry.positioned) return;

        const loopWidth = getLoopWidth();
        if (loopWidth <= 0) return;

        const realStart = allSlidesEls[firstRealIndex];
        const realStartLeft = realStart.offsetLeft - track.offsetLeft;
        const realEnd = allSlidesEls[lastRealIndex];
        const realEndLeft = realEnd.offsetLeft - track.offsetLeft;

        const maxScrollLeft = track.scrollWidth - track.clientWidth;

        const backwardSlack = realStartLeft;
        const forwardSlack = maxScrollLeft - realEndLeft;

        const backwardMargin = Math.max(backwardSlack * 0.85, 4);
        const forwardMargin = Math.max(forwardSlack * 0.85, 4);

        const dragState = getDragState(track);

        if (track.scrollLeft < realStartLeft - backwardMargin) {
          isTeleporting = true;
          track.scrollLeft += loopWidth;
          if (dragState.isDown) dragState.startScrollLeft += loopWidth;
          requestAnimationFrame(() => { isTeleporting = false; });
          return;
        }

        if (track.scrollLeft > realEndLeft + forwardMargin) {
          isTeleporting = true;
          track.scrollLeft -= loopWidth;
          if (dragState.isDown) dragState.startScrollLeft -= loopWidth;
          requestAnimationFrame(() => { isTeleporting = false; });
        }
      },
      { passive: true }
    );
  });
}

function setupCarouselDrag() {
  document.querySelectorAll(".home-carousel__track").forEach((track) => {
    const dragState = getDragState(track);
    let startX = 0;
    let moved = false;
    let history = [];

    track.addEventListener("mousedown", (e) => {
      dragState.isDown = true;
      moved = false;
      startX = e.clientX;
      dragState.startScrollLeft = track.scrollLeft;
      history = [{ t: performance.now(), x: e.clientX }];
      track.classList.add("is-dragging");
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragState.isDown) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 3) moved = true;
      track.scrollLeft = dragState.startScrollLeft - dx;

      history.push({ t: performance.now(), x: e.clientX });
      const cutoff = performance.now() - 100;
      history = history.filter((p) => p.t >= cutoff);
    });

    window.addEventListener("mouseup", () => {
      if (!dragState.isDown) return;
      dragState.isDown = false;
      track.classList.remove("is-dragging");

      if (moved) {
        let velocity = 0;
        if (history.length >= 2) {
          const first = history[0];
          const last = history[history.length - 1];
          const dt = last.t - first.t;
          if (dt > 0) velocity = (last.x - first.x) / dt;
        }

        const THRESHOLD = 0.25;
        if (Math.abs(velocity) > THRESHOLD) {
          const slide = track.querySelector("[data-carousel-slide]");
          const slideWidth = slide ? slide.getBoundingClientRect().width : track.clientWidth;
          const boost = Math.min(Math.abs(velocity) * 120, slideWidth * 0.45);
          track.scrollLeft += velocity < 0 ? boost : -boost;
        }

        const suppressNextClick = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          track.removeEventListener("click", suppressNextClick, true);
        };
        track.addEventListener("click", suppressNextClick, true);
      }

      history = [];
    });

    track.addEventListener("mouseleave", () => {
      if (dragState.isDown) {
        dragState.isDown = false;
        track.classList.remove("is-dragging");
        history = [];
      }
    });
  });
}

const tooltipPortals = new WeakMap();
const tooltipTriggerToPanel = new WeakMap();

function findTooltipPanel(triggerEl) {
  if (tooltipTriggerToPanel.has(triggerEl)) return tooltipTriggerToPanel.get(triggerEl);
  const panel = triggerEl.nextElementSibling;
  if (panel) tooltipTriggerToPanel.set(triggerEl, panel);
  return panel;
}

function showTooltipPortal(panel, cursorX, cursorY, fallbackTriggerEl) {
  if (!tooltipPortals.has(panel)) {
    const placeholder = document.createComment("tooltip-panel-placeholder");
    panel.after(placeholder);
    tooltipPortals.set(panel, { placeholder });
  }
  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
    panel.classList.add("home-leaf__tooltip--portal");
  }
  panel.hidden = false;
  positionTooltipFixed(panel, cursorX, cursorY, fallbackTriggerEl);
}

function hideTooltipPortal(panel) {
  panel.hidden = true;
  const portal = tooltipPortals.get(panel);
  if (portal && panel.parentElement === document.body) {
    portal.placeholder.after(panel);
    panel.classList.remove("home-leaf__tooltip--portal");
  }
}

function setupTooltipScrollDismiss() {
  let scrollRaf = null;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        document.querySelectorAll(".home-leaf__tooltip--portal").forEach((panel) => {
          if (!panel.hidden) hideTooltipPortal(panel);
        });
      });
    },
    { passive: true, capture: true }
  );
}

function positionTooltipFixed(panel, cursorX, cursorY, fallbackTriggerEl) {
  const margin = 12;
  let left = cursorX;
  let top = cursorY != null ? cursorY + 16 : null;

  if (left == null || top == null) {
    const triggerRect = fallbackTriggerEl.getBoundingClientRect();
    left = left ?? triggerRect.left;
    top = top ?? triggerRect.bottom + 6;
  }

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;

  const rect = panel.getBoundingClientRect();

  const rightOverflow = rect.right - window.innerWidth;
  if (rightOverflow > 0) left -= rightOverflow + margin;
  if (left < margin) left = margin;

  const bottomOverflow = rect.bottom - window.innerHeight;
  if (bottomOverflow > 0) top = (cursorY ?? top) - rect.height - 16;

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function setupTooltipHover() {
  document.querySelectorAll(".home-leaf--tooltip").forEach((leaf) => {
    const trigger = leaf.querySelector("[data-tooltip-trigger]");
    const panel = leaf.querySelector("[data-tooltip-panel]");
    if (!trigger || !panel) return;

    tooltipTriggerToPanel.set(trigger, panel);

    leaf.addEventListener("mouseenter", (e) => showTooltipPortal(panel, e.clientX, e.clientY));
    leaf.addEventListener("mousemove", (e) => {
      if (!panel.hidden) positionTooltipFixed(panel, e.clientX, e.clientY);
    });
    leaf.addEventListener("mouseleave", () => hideTooltipPortal(panel));
  });
}

function setupRevealHandlers() {
  document.addEventListener("click", (e) => {
    const accordionTrigger = e.target.closest("[data-accordion-trigger]");
    if (accordionTrigger) {
      const panel = accordionTrigger.nextElementSibling;
      if (panel) {
        const isOpen = accordionTrigger.getAttribute("aria-expanded") === "true";
        accordionTrigger.setAttribute("aria-expanded", String(!isOpen));
        panel.hidden = isOpen;
        if (!isOpen) requestAnimationFrame(() => voidFly?.revealScope(panel));
      }
      return;
    }

    const spoilerTrigger = e.target.closest("[data-spoiler-trigger]");
    if (spoilerTrigger) {
      const content = spoilerTrigger.nextElementSibling;
      if (content) {
        const isOpen = spoilerTrigger.getAttribute("aria-expanded") === "true";
        spoilerTrigger.setAttribute("aria-expanded", String(!isOpen));
        content.hidden = isOpen;
      }
      return;
    }

    const tooltipTrigger = e.target.closest("[data-tooltip-trigger]");
    if (tooltipTrigger) {
      const panel = findTooltipPanel(tooltipTrigger);
      if (panel) {
        if (panel.hidden) {
          showTooltipPortal(panel, null, null, tooltipTrigger);
        } else {
          hideTooltipPortal(panel);
        }
      }
      return;
    }

    const modalTrigger = e.target.closest("[data-modal-trigger]");
    if (modalTrigger) {
      const content = modalTrigger.nextElementSibling;
      if (content && content.hasAttribute("data-modal-content")) {
        openHomeModal(content);
      }
      return;
    }
  });
}

function openHomeModal(sourceEl) {
  const modal = document.getElementById("homeModal");
  if (!modal) return;

  const titleEl = document.getElementById("homeModalTitle");
  const bodyEl = document.getElementById("homeModalBody");

  const titleSource = sourceEl.querySelector("[data-modal-title]");
  titleEl.textContent = titleSource ? titleSource.textContent : "";

  bodyEl.innerHTML = "";
  Array.from(sourceEl.children).forEach((child) => {
    if (child.hasAttribute("data-modal-title")) return;
    bodyEl.appendChild(child.cloneNode(true));
  });

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeHomeModal() {
  const modal = document.getElementById("homeModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

function setupHomeModal() {
  const modal = document.getElementById("homeModal");
  if (!modal) return;

  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  const closeBtn = document.getElementById("homeModalClose");
  closeBtn?.addEventListener("click", closeHomeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeHomeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) closeHomeModal();
  });
}

const widgetInitializers = {
  "chart-demo": initChartDemoPlaceholder,
  "leaderboard-demo": initLeaderboardDemoPlaceholder,
  "settings-demo": initSettingsDemoPlaceholder,
  "profile-demo": initProfileDemoPlaceholder,
  "settings-account-demo": initAccountSettingsDemoPlaceholder,
  "servers-demo": initServersDemoPlaceholder,
  "server-demo": initServerDemoPlaceholder,
};

const initializedWidgets = new Set();

function initWidgetsWithin(panelEl) {
  if (!panelEl) return;
  panelEl.querySelectorAll("[data-widget]").forEach((el) => {
    const key = el.dataset.widget;
    if (initializedWidgets.has(el)) return;
    const init = widgetInitializers[key];
    if (typeof init === "function") {
      init(el);
      initializedWidgets.add(el);
    }
  });
}

function createSlideSwitcher(trackEl, buttons, panels, onActivated) {
  let activeIndex = panels.findIndex((p) => p.classList.contains("is-active"));
  if (activeIndex < 0) activeIndex = 0;

  let isAnimating = false;

  function targetIndexOf(target) {
    return panels.findIndex((p) => (p.dataset.panel || p.dataset.subpanel) === target);
  }

  function activate(target) {
    const nextIndex = targetIndexOf(target);
    if (nextIndex < 0 || nextIndex === activeIndex || isAnimating) return;

    const goingRight = nextIndex > activeIndex;
    const currentPanel = panels[activeIndex];
    const nextPanel = panels[nextIndex];

    const startHeight = trackEl.getBoundingClientRect().height;
    trackEl.style.height = `${startHeight}px`;
    trackEl.classList.add("is-animating");

    nextPanel.classList.add("is-active");
    nextPanel.classList.add(goingRight ? "is-entering-from-right" : "is-entering-from-left");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        currentPanel.classList.add(goingRight ? "is-leaving-to-left" : "is-leaving-to-right");
        currentPanel.classList.remove("is-active");
        nextPanel.classList.remove("is-entering-from-right", "is-entering-from-left");
      });
    });

    buttons.forEach((btn, i) => {
      const isActive = i === nextIndex;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    });

    const endHeight = nextPanel.getBoundingClientRect().height;
    requestAnimationFrame(() => {
      trackEl.style.height = `${endHeight}px`;
    });

    const cleanup = () => {
      currentPanel.classList.remove("is-leaving-to-left", "is-leaving-to-right");
      nextPanel.classList.remove("is-entering-from-left", "is-entering-from-right");
      trackEl.classList.remove("is-animating");
      trackEl.style.height = "";
      isAnimating = false;
      activeIndex = nextIndex;
      onActivated?.(target);
    };

    isAnimating = true;
    let settled = false;
    const onTransitionEnd = (e) => {
      if (e.target !== nextPanel || e.propertyName !== "transform") return;
      if (settled) return;
      settled = true;
      nextPanel.removeEventListener("transitionend", onTransitionEnd);
      cleanup();
    };
    nextPanel.addEventListener("transitionend", onTransitionEnd);

    const fallbackMs = 500;
    setTimeout(() => {
      if (!settled) {
        settled = true;
        nextPanel.removeEventListener("transitionend", onTransitionEnd);
        cleanup();
      }
    }, fallbackMs);
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => activate(btn.dataset.target));
  });

  return { activate };
}

let mainSwitcherRef = null;
let subSwitchersRef = {};
let stickyEls = null;

function renderStickyRow(container, sourceButtons, activeTarget) {
  container.innerHTML = "";
  sourceButtons.forEach((btn) => {
    const label = btn.querySelector("span")?.textContent ?? btn.textContent;
    const b = document.createElement("button");
    b.type = "button";
    b.className = btn.className;
    b.textContent = label;
    b.dataset.target = btn.dataset.target;
    b.classList.toggle("is-active", btn.dataset.target === activeTarget);
    container.appendChild(b);
  });
}

function syncStickyTabs() {
  if (!stickyEls) return;

  const mainRoot = $("#homeMainTabs");
  const mainTabs = $$(".home-tab", mainRoot);
  const activePanel = $(".home-panel.is-active", mainRoot);
  const activeMainTarget = activePanel?.dataset.panel ?? mainTabs.find(t => t.classList.contains("is-active"))?.dataset.target;

  renderStickyRow(stickyEls.mainRow, mainTabs, activeMainTarget);

  const panelKey = activePanel?.dataset.panel;
  const subTabs = activePanel ? $$(".home-subtab", activePanel) : [];
  const activeSubpanel = activePanel ? $(".home-subpanel.is-active", activePanel) : null;
  const activeSubTarget = activeSubpanel?.dataset.subpanel ?? subTabs.find(t => t.classList.contains("is-active"))?.dataset.target;

  renderStickyRow(stickyEls.subRow, subTabs, activeSubTarget);
}

function setupStickyTabs() {
  const sticky = $("#homeStickyTabs");
  const anchor = $("#homeMainTabs");
  if (!sticky || !anchor) return;

  const scrollContainer = document.querySelector(".main") || window;

  stickyEls = {
    strip: $("[data-sticky-strip]", sticky),
    mainRow: $("[data-sticky-main]", sticky),
    subRow: $("[data-sticky-sub]", sticky),
  };

  stickyEls.mainRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-target]");
    if (!btn) return;
    mainSwitcherRef?.activate(btn.dataset.target);
    anchor.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  stickyEls.subRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-target]");
    if (!btn) return;
    const activePanel = $(".home-panel.is-active", anchor);
    const panelKey = activePanel?.dataset.panel;
    const subSwitcher = panelKey ? subSwitchersRef[panelKey] : null;
    subSwitcher?.activate(btn.dataset.target);
    anchor.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  let expanded = false;

  function setExpanded(value) {
    expanded = value;
    sticky.classList.toggle("is-expanded", expanded);
  }

  sticky.addEventListener("mouseenter", () => setExpanded(true));
  sticky.addEventListener("mouseleave", () => setExpanded(false));

  stickyEls.strip.addEventListener("click", () => setExpanded(!expanded));
  stickyEls.strip.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); }
  });

  document.addEventListener("click", (e) => {
    if (expanded && !sticky.contains(e.target)) setExpanded(false);
  });

  let visible = false;
  let rafId = null;

  function updateVisibility() {
    rafId = null;
    const rect = anchor.getBoundingClientRect();
    const topbarH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--top-h")) || 64;

    const shouldShow = rect.top < topbarH && rect.bottom > topbarH;

    if (shouldShow !== visible) {
      visible = shouldShow;
      sticky.hidden = false;
      sticky.classList.toggle("is-visible", visible);
      if (!visible) setExpanded(false);
    }
  }

  scrollContainer.addEventListener("scroll", () => {
    if (rafId) return;
    rafId = requestAnimationFrame(updateVisibility);
  }, { passive: true });

  updateVisibility();
  syncStickyTabs();
}

function setupMainTabs(root) {
  const track = $("#mainSlideTrack", root);
  const tabs = $$(".home-tab", root);
  const panels = $$(".home-panel", track);

  const switcher = createSlideSwitcher(track, tabs, panels, (target) => {
    const activePanel = panels.find((p) => p.dataset.panel === target);
    const activeSubpanel = activePanel?.querySelector(".home-subpanel.is-active");
    initWidgetsWithin(activeSubpanel);
    repositionVisibleCarousels(activeSubpanel);
    requestAnimationFrame(() => voidFly?.revealScope(activePanel));
    syncStickyTabs();
  });

  const initialPanel = panels.find((p) => p.classList.contains("is-active"));
  const initialSubpanel = initialPanel?.querySelector(".home-subpanel.is-active");
  initWidgetsWithin(initialSubpanel);
  repositionVisibleCarousels(initialSubpanel);

  return switcher;
}

function setupSubTabs(root) {
  const switchers = {};

  $$(".home-panel", root).forEach((panel) => {
    const track = $(".home-slide-track[data-subtrack]", panel);
    if (!track) return;

    const subtabs = $$(".home-subtab", panel);
    const subpanels = $$(".home-subpanel", track);
    const panelKey = panel.dataset.panel;

    switchers[panelKey] = createSlideSwitcher(track, subtabs, subpanels, (target) => {
      if (panel.classList.contains("is-active")) {
        const activeSubpanel = subpanels.find((p) => p.dataset.subpanel === target);
        initWidgetsWithin(activeSubpanel);
        repositionVisibleCarousels(activeSubpanel);
        requestAnimationFrame(() => voidFly?.revealScope(activeSubpanel));
      }
      syncStickyTabs();
    });
  });

  return switchers;
}

export async function initHomePage() {
  const root = $("#homeMainTabs");

  voidFly = initVoidFly({ scrollRoot: document.querySelector(".main"), excludeSelector: "#homeModal" });
  window.addEventListener("app:page-ready", () => voidFly?.playInitialEntrances(), { once: true });

  if (root) {
    mainSwitcherRef = setupMainTabs(root);
    subSwitchersRef = setupSubTabs(root);
  }
  setupRevealHandlers();
  setupInfiniteCarousels();
  setupCarouselDrag();
  setupTooltipHover();
  setupTooltipScrollDismiss();
  setupHomeModal();
  setupStickyTabs();

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
