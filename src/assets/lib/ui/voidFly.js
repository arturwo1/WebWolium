const HIDE_DELAY_MS = 220;

function getTargets(scope) {
  if (!scope) return [];
  return scope.matches?.(".fly-reveal") ? [scope] : [...scope.querySelectorAll(".fly-reveal")];
}

export function initVoidFly({ scrollRoot, excludeSelector = null } = {}) {
  const ioRoot = scrollRoot && scrollRoot !== window ? scrollRoot : null;
  const registered = new WeakSet();
  const initialVisible = new WeakSet();
  const entrancePlayed = new WeakSet();
  const wobbling = new Set();
  let initialEntranceEnabled = false;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isExcluded = (el) => Boolean(excludeSelector && el.closest(excludeSelector));
  const isCarouselContent = (el) => Boolean(el.closest("[data-carousel-slide]"));

  function isInsideVerticalFlightZone(el) {
    const root = ioRoot?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const inset = (root.bottom - root.top) * 0.05;
    const bounds = el.getBoundingClientRect();
    return bounds.bottom > root.top + inset && bounds.top < root.bottom - inset;
  }

  function setState(reveal, visible, hiddenSide = "bottom") {
    if (visible) {
      reveal.classList.remove("fly-hidden-top", "fly-hidden-bottom");
      reveal.classList.add("fly-visible");
      return;
    }
    reveal.classList.remove("fly-visible", "fly-hidden-top", "fly-hidden-bottom");
    reveal.classList.add(hiddenSide === "top" ? "fly-hidden-top" : "fly-hidden-bottom");
    if (reveal._inner) reveal._inner.style.transform = "";
  }

  function setupIdle(reveal) {
    const inner = reveal.querySelector(".fly-inner");
    if (!inner || reveal._inner || reduceMotion) return;
    const rect = inner.getBoundingClientRect();
    const size = Math.max(30, Math.min(rect.width || 80, rect.height || 40));
    reveal._floatAmp = Math.max(2, Math.min(5, size * 0.028));
    reveal._floatAmpRot = Math.max(0.4, Math.min(1.2, size * 0.007));
    reveal._floatSpeed = 0.3 + Math.random() * 0.3;
    reveal._floatPhase = Math.random() * Math.PI * 2;
    reveal._repelMax = Math.max(4, Math.min(8, size * 0.045));
    reveal._repelX = 0;
    reveal._repelY = 0;
    reveal._repelTargetX = 0;
    reveal._repelTargetY = 0;
    reveal._inner = inner;

    inner.addEventListener("mousemove", (event) => {
      const bounds = inner.getBoundingClientRect();
      const dx = event.clientX - (bounds.left + bounds.width / 2);
      const dy = event.clientY - (bounds.top + bounds.height / 2);
      reveal._repelTargetX = -(dx / Math.max(bounds.width / 2, 1)) * reveal._repelMax;
      reveal._repelTargetY = -(dy / Math.max(bounds.height / 2, 1)) * reveal._repelMax;
    });
    inner.addEventListener("mouseleave", () => {
      reveal._repelTargetX = 0;
      reveal._repelTargetY = 0;
    });
  }

  let animationTime = 0;
  function animateIdle() {
    animationTime += 0.016;
    for (const reveal of wobbling) {
      if (!reveal._inner || !reveal.classList.contains("fly-visible")) continue;
      const y = Math.sin(animationTime * reveal._floatSpeed + reveal._floatPhase) * reveal._floatAmp;
      const rotation = Math.sin(animationTime * reveal._floatSpeed * 0.7 + reveal._floatPhase) * reveal._floatAmpRot;
      reveal._repelX += (reveal._repelTargetX - reveal._repelX) * 0.07;
      reveal._repelY += (reveal._repelTargetY - reveal._repelY) * 0.07;
      reveal._inner.style.transform = `translate(${reveal._repelX}px, ${y + reveal._repelY}px) rotate(${rotation}deg)`;
    }
    requestAnimationFrame(animateIdle);
  }
  if (!reduceMotion) requestAnimationFrame(animateIdle);

  function playEntrance(reveal, index) {
    entrancePlayed.add(reveal);
    if (reduceMotion) return setState(reveal, true);
    const angles = [225, 45, 315, 135, 270, 90, 0, 180];
    const angle = (angles[index % angles.length] + (Math.random() - 0.5) * 25) * Math.PI / 180;
    const distance = 55 + Math.random() * 40;
    reveal.classList.remove("fly-hidden-top", "fly-hidden-bottom", "fly-visible");
    reveal.style.transition = "none";
    reveal.style.opacity = "0";
    reveal.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) rotate(${(Math.random() - 0.5) * 22}deg)`;
    void reveal.offsetWidth;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      reveal.style.transition = "transform .7s cubic-bezier(.25,1.2,.4,1), opacity .5s ease";
      reveal.style.transitionDelay = `${(index % 8) * 40}ms`;
      reveal.style.opacity = "1";
      reveal.style.transform = "translate(0, 0) rotate(0deg)";
      window.setTimeout(() => {
        reveal.style.transition = "";
        reveal.style.transitionDelay = "";
        reveal.style.transform = "";
        reveal.style.opacity = "";
        setState(reveal, true);
      }, 750 + (index % 8) * 40);
    }));
  }

  function cancelHide(reveal) {
    if (!reveal._hideTimer) return;
    clearTimeout(reveal._hideTimer);
    reveal._hideTimer = null;
  }

  function scheduleHide(reveal, side) {
    reveal._pendingHideSide = side;
    if (reveal._hideTimer) return;
    reveal._hideTimer = window.setTimeout(() => {
      reveal._hideTimer = null;
      setState(reveal, false, reveal._pendingHideSide);
    }, HIDE_DELAY_MS);
  }

  let entranceIndex = 0;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const reveal = entry.target;
      if (isExcluded(reveal)) continue;
      if (entry.isIntersecting) {
        cancelHide(reveal);
        setupIdle(reveal);
        if (reveal._inner) wobbling.add(reveal);
        if (initialEntranceEnabled && initialVisible.has(reveal) && !entrancePlayed.has(reveal)) playEntrance(reveal, entranceIndex++);
        else setState(reveal, true);
      } else {
        if (isCarouselContent(reveal) && isInsideVerticalFlightZone(reveal)) continue;
        const rootTop = entry.rootBounds?.top ?? 0;
        scheduleHide(reveal, entry.boundingClientRect.top < rootTop ? "top" : "bottom");
      }
    }
  }, { root: ioRoot, rootMargin: "-5% 0px -5% 0px", threshold: 0 });

  function observe(scope = document) {
    for (const reveal of getTargets(scope)) {
      if (isExcluded(reveal) || registered.has(reveal)) continue;
      registered.add(reveal);
      observer.observe(reveal);
      if (isCarouselContent(reveal)) {
        setupIdle(reveal);
        if (reveal._inner) wobbling.add(reveal);
        setState(reveal, true);
      }
    }
  }

  function revealScope(scope) {
    observe(scope);
    for (const reveal of getTargets(scope)) {
      cancelHide(reveal);
      setupIdle(reveal);
      if (reveal._inner) wobbling.add(reveal);
      setState(reveal, true);
    }
  }

  const initialReveals = [];
  for (const reveal of getTargets(document)) {
    if (isExcluded(reveal)) continue;
    if (isInsideVerticalFlightZone(reveal)) {
      initialVisible.add(reveal);
      initialReveals.push(reveal);
    }
  }
  observe(document);
  if (excludeSelector) revealScope(document.querySelector(excludeSelector));

  function playInitialEntrances() {
    initialEntranceEnabled = true;
    for (const reveal of initialReveals) {
      if (entrancePlayed.has(reveal)) continue;
      setupIdle(reveal);
      if (reveal._inner) wobbling.add(reveal);
      playEntrance(reveal, entranceIndex++);
    }
  }

  return { observe, revealScope, playInitialEntrances };
}
