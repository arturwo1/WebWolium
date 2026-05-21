const KEY = "wolium:page-transition";

function isModifiedEvent(e) {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

function isInternalLink(a) {
  if (!a) return false;
  if (a.target && a.target !== "_self") return false;
  if (a.hasAttribute("download")) return false;

  const href = a.getAttribute("href");
  if (!href) return false;
  if (href.startsWith("#")) return false;
  if (href.startsWith("mailto:")) return false;
  if (href.startsWith("tel:")) return false;
  if (href.startsWith("javascript:")) return false;

  const url = new URL(a.href, window.location.href);

  if (url.origin !== window.location.origin) return false;

  const current = new URL(window.location.href);
  if (
    url.pathname === current.pathname &&
    url.search === current.search &&
    url.hash !== current.hash
  ) {
    return false;
  }

  return true;
}

function setTransitionState(mode, href = "") {
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        mode,
        href,
        ts: Date.now()
      })
    );
  } catch { }
}

export function initPageTransitions() {
  let navigating = false;

  document.addEventListener("click", (e) => {
    if (navigating) return;
    if (e.defaultPrevented) return;
    if (isModifiedEvent(e)) return;
    if (e.button !== 0) return;

    const a = e.target.closest("a[href]");
    if (!isInternalLink(a)) return;

    const url = new URL(a.href, window.location.href);

    e.preventDefault();
    navigating = true;

    setTransitionState("internal-link", url.href);
    document.documentElement.classList.add("pt-leave-main");

    const content = document.getElementById("pageContent");

    const go = () => {
      window.location.href = url.href;
    };

    if (!content) {
      go();
      return;
    }

    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      go();
    };

    content.addEventListener("transitionend", finish, { once: true });
    window.setTimeout(finish, 420);
  });

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      document.documentElement.classList.remove("pt-leave-main");
    }
  });
}