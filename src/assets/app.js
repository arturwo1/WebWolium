import { createClient } from "@supabase/supabase-js";
import CFG from "./config.js";

import { initProfilePage } from "./pages/profile.js";
import "./style.css";

import { img } from "./images.js";

const $ = (s, r = document) => r.querySelector(s);
const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);

const IDENTITY_KEY = "wolium:last_identity";

function saveIdentity(session) {
  try {
    const u = session?.user;
    if (!u) return;
    const m = u.user_metadata || {};
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({
      userId: u.id,
      name: m.full_name || m.name || m.username || u.email || "",
      avatar: m.avatar_url || m.picture || null,
      ts: Date.now()
    }));
  } catch {}
}

function readIdentity() {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let sb = null;

if (CFG?.SUPABASE_URL && CFG?.SUPABASE_ANON_KEY) {
  sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
} else {
  console.error("[app] Supabase client not configured.");
}

const PUBLIC_PAGES = new Set(["rules", "terms-of-service", "privacy"]);
function isPublicPage() {
  const pid = document.body.dataset.page || "";
  if (PUBLIC_PAGES.has(pid)) return true;
  const p = location.pathname;
  return p.startsWith("/rules/") || p.startsWith("/terms-of-service/") || p.startsWith("/privacy-policy/");
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

function bindHeadImages() {
  const icon = img("Wolium.webp");
  if (!icon) return;

  const linkIcon = document.querySelector("[data-dyn-icon]");
  if (linkIcon) linkIcon.href = icon;

  const og = document.querySelector("[data-dyn-og]");
  if (og) og.setAttribute("content", icon);

  const tw = document.querySelector("[data-dyn-tw]");
  if (tw) tw.setAttribute("content", icon);
}

function setLoggedInUI(session, cached) {
  const btnLogin = $("#btnLogin");
  const userBox = $("#userBox");
  const avatarImg = $("#userAvatarImg");

  const meta = session?.user?.user_metadata || {};
  const url = meta.avatar_url || meta.picture || cached?.avatar || null;

  const loggedIn = !!session || !!cached;
  if (btnLogin) btnLogin.hidden = loggedIn;
  if (userBox) userBox.hidden = !loggedIn;

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
  const cached = readIdentity();

  if (!sb) {
    setLoggedInUI(null, cached);
    if (publicPage || cached) showShell();
    else showGate();
    return null;
  }

  let session = null;
  try {
    const { data } = await sb.auth.getSession();
    session = data?.session || null;
  } catch {
    session = null;
  }

  if (session) saveIdentity(session);

  setLoggedInUI(session, cached);

  if (!session) {
    if (publicPage || (!navigator.onLine && cached)) showShell();
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
  bindHeadImages();

  highlightNav();
  initDropdowns();
  initMobileDrawer();
  initProfileUI();

  on($("#btnLogin"), "click", startLogin);
  on($("#btnLoginCenter"), "click", startLogin);

  const session = await syncAuthUI();

  if (sb) {
    sb.auth.onAuthStateChange(async (_e, newSession) => {
      setLoggedInUI(newSession, readIdentity());

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