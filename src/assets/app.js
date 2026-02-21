import CFG from "./config.js";
import "./style.css";

import {
  bindHeadImages,
  createSupabaseClient,
  initMobileDrawer,
  initUserDropdown,
  isPublicPage,
  readIdentity,
  registerServiceWorker,
  saveIdentity,
  setLoggedInUI,
  showGate,
  showShell,
  startOAuthLogin,
  highlightNav,
  $
} from "@/lib/index.js";

import { initProfilePage } from "./pages/profile.js";

const started = new Set();

function pageId() {
  return document.body?.dataset?.page || "";
}

async function syncAuthUI(sb) {
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

async function initCurrentPage(sb, session) {
  const pid = pageId();

  if (pid === "profile") {
    if (!session) return;
    if (started.has("profile")) return;
    started.add("profile");
    await initProfilePage(sb);
    return;
  }
}

async function boot() {
  registerServiceWorker();
  bindHeadImages();

  highlightNav();
  initMobileDrawer();

  const sb = createSupabaseClient(CFG);
  if (!sb) console.error("[app] Supabase client not configured.");

  initUserDropdown({
    onLogout: async () => {
      await sb?.auth?.signOut();
      started.clear();
      await syncAuthUI(sb);
    }
  });

  const onLogin = async () => {
    try {
      await startOAuthLogin(sb, { provider: "discord", redirectPath: "/profile/" });
    } catch {
      alert("Supabase not configured");
    }
  };

  $("#btnLogin")?.addEventListener("click", onLogin);
  $("#btnLoginCenter")?.addEventListener("click", onLogin);

  const session = await syncAuthUI(sb);
  await initCurrentPage(sb, session);

  if (sb) {
    sb.auth.onAuthStateChange(async (_e, newSession) => {
      setLoggedInUI(newSession, readIdentity());
      if (newSession) saveIdentity(newSession);

      if (!newSession) {
        started.clear();
        if (isPublicPage()) showShell();
        else showGate();
        return;
      }

      showShell();
      await initCurrentPage(sb, newSession);
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
