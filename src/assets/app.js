import { initProfilePage } from "./pages/profile.js";

const $ = (s, r = document) => r.querySelector(s);
const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);

const CFG = window.APP_CONFIG || {};
let sb = null;

const PUBLIC_PAGES = new Set(["rules", "terms-of-service", "privacy"]);
function isPublicPage() {
  const pid = document.body.dataset.page || "";
  if (PUBLIC_PAGES.has(pid)) return true;

  const p = location.pathname;
  return p.startsWith("/rules/") || p.startsWith("/terms-of-service/") || p.startsWith("/privacy-policy/");
}

if (window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) {
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
}

if (!sb) {
  console.error("[app] Supabase client not configured.");
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;

  const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const isHttps = location.protocol === "https:";
  if (!isHttps && !isLocalhost) return;

  const swUrl = "/sw.js";

  navigator.serviceWorker.register(swUrl, { scope: "/" })
    .then(async (reg) => {
      try {
        await reg.update();
      } catch { }

      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
        });
      });
    })
    .catch((e) => console.warn("[sw] register failed:", e));

  navigator.serviceWorker.addEventListener("message", (ev) => {
    if (ev?.data?.type === "SW_RELOAD") location.reload();
  });
}

function setLoggedInUI(session) {
  const btnLogin = $("#btnLogin");
  const userBox = $("#userBox");
  const avatarImg = $("#userAvatarImg");

  const loggedIn = !!session;
  if (btnLogin) btnLogin.hidden = loggedIn;
  if (userBox) userBox.hidden = !loggedIn;

  const meta = session?.user?.user_metadata || {};
  const name = meta.full_name || meta.name || meta.username || session?.user?.email || "";

  const url = meta.avatar_url || meta.picture || null;
  if (avatarImg && url) avatarImg.src = url;
}

function showGate() {
  $("#authGate")?.removeAttribute("hidden");
  $("#appShell")?.setAttribute("hidden", "hidden");
}

function showShell() {
  $("#authGate")?.setAttribute("hidden", "hidden");
  $("#appShell")?.removeAttribute("hidden");
}

async function startLogin() {
  if (!sb) return alert("Supabase not configured");
  await sb.auth.signInWithOAuth({
    provider: "discord",
    options: { redirectTo: `${location.origin}/profile/` }
  });
}

async function syncAuthUI() {
  const publicPage = isPublicPage();

  if (!sb) {
    setLoggedInUI(null);
    if (publicPage) showShell();
    else showGate();
    return null;
  }

  const { data } = await sb.auth.getSession().catch(() => ({ data: null }));
  const session = data?.session || null;

  setLoggedInUI(session);

  if (!session) {
    if (publicPage) showShell();
    else showGate();
  } else {
    showShell();
  }

  return session;
}

function highlightNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll(".nav__item").forEach(a => {
    a.classList.toggle("is-active", a.dataset.nav === page);
  });
}

function initDropdowns() {
  const btnAvatar = $("#btnAvatar");
  const userDropdown = $("#userDropdown");

  if (!btnAvatar || !userDropdown) return;

  const close = () => {
    userDropdown.classList.remove("is-open");
    btnAvatar.setAttribute("aria-expanded", "false");
  };

  on(btnAvatar, "click", (e) => {
    e.stopPropagation();
    const openNow = userDropdown.classList.contains("is-open");
    close();
    userDropdown.classList.toggle("is-open", !openNow);
    btnAvatar.setAttribute("aria-expanded", String(!openNow));
  });

  on(document, "click", close);

  on(userDropdown, "click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (btn?.dataset?.action === "logout") {
      await sb?.auth?.signOut();
      await syncAuthUI();
    }
  });
}

function initMobileDrawer() {
  const sidebar = $("#sidebar");
  const overlay = $("#overlay");
  const btnMenu = $("#btnMenu");
  const btnClose = $("#btnClose");

  const open = () => {
    sidebar?.classList.add("is-open");
    overlay?.classList.add("is-on");
  };
  const close = () => {
    sidebar?.classList.remove("is-open");
    overlay?.classList.remove("is-on");
  };

  on(btnMenu, "click", open);
  on(btnClose, "click", close);
  on(overlay, "click", close);
}

function initProfileUI() {
  if (document.body.dataset.page !== "profile") return;

  const statsRoot = $("#profileStats");
  const chartModal = $("#chartModal");
  const chartClose = $("#chartClose");
  const chartTitle = $("#chartTitle");

  if (!statsRoot || !chartModal || !chartClose || !chartTitle) return;

  function openChart(type) {
    chartTitle.textContent =
      type === "messages" ? "Messages" :
        type === "voice" ? "Voice" :
          type === "activities" ? "Activities" :
            "Graphic";

    chartModal.classList.add("is-open");
    chartModal.setAttribute("aria-hidden", "false");
  }

  function closeChart() {
    chartModal.classList.remove("is-open");
    chartModal.setAttribute("aria-hidden", "true");
  }

  on(statsRoot, "click", (e) => {
    const btn = e.target.closest(".stat--link");
    const type = btn?.dataset?.chart;
    if (!type) return;
    openChart(type);
  });

  on(chartClose, "click", closeChart);
  on(chartModal, "click", (e) => {
    if (e.target === chartModal) closeChart();
  });
}

let profileStarted = false;

async function boot() {
  registerSW();

  highlightNav();
  initDropdowns();
  initMobileDrawer();
  initProfileUI();

  on($("#btnLogin"), "click", startLogin);
  on($("#btnLoginCenter"), "click", startLogin);

  const session = await syncAuthUI();

  if (sb) {
    sb.auth.onAuthStateChange(async (_e, newSession) => {
      setLoggedInUI(newSession);

      const publicPage = isPublicPage();

      if (!newSession) {
        if (publicPage) showShell();
        else showGate();

        profileStarted = false;
        return;
      }

      showShell();

      if (!profileStarted && document.body.dataset.page === "profile") {
        profileStarted = true;
        initProfilePage(sb);
      }
    });
  }

  if (session && sb && !profileStarted) {
    profileStarted = true;
    initProfilePage(sb);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}