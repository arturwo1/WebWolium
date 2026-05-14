import CFG from "./config.js";

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
  initConsent,
  lsDel,
  $
} from "@/lib/index.js";

import { initProfilePage } from "./pages/profile.js";
import { initHomePage } from "./pages/index.js";
import { initSettingsPage } from "./pages/settings.js";
import { initNewsPage } from "./pages/news.js";
import { initLeaderboardPage } from "./pages/leaderboard.js";

import { initPageTransitions } from "@/lib/ui/pageTransitions.js";
import { initI18n, applyDomI18n, t } from "@/lib/text/i18n.js";

import "highlight.js/styles/github-dark.css";

await initI18n();
initConsent();

const mo = new MutationObserver((muts) => {
  for (const m of muts) {
    for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      applyDomI18n(n);
    }
  }
});

mo.observe(document.documentElement, { childList: true, subtree: true });

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
  } else if (pid === "home") {
    if (started.has("home")) return;
    started.add("home");
    await initHomePage(sb);
    return;
  } else if (pid === "settings") {
    if (!session) return;
    if (started.has("settings")) return;
    started.add("settings");
    await initSettingsPage(sb);
    return;
  } else if (pid === "news") {
    if (started.has("news")) return;
    started.add("news");
    await initNewsPage();
    return;
  } else if (pid === "leaderboard") {
    if (!session) return;
    if (started.has("leaderboard")) return;
    started.add("leaderboard");
    await initLeaderboardPage(sb);
    return;
  }
}

async function boot() {
  initPageTransitions();

  registerServiceWorker();
  // bindHeadImages();

  highlightNav();
  initMobileDrawer();

  const sb = createSupabaseClient(CFG);
  if (!sb) console.error("[app] Supabase client not configured.");

  initUserDropdown({
    onLogout: async () => {
      lsDel("wolium:last_identity");
      await sb?.auth?.signOut();
      started.clear();
      await syncAuthUI(sb);
    }
  });

  const onLogin = async () => {
    try {
      await startOAuthLogin(sb, { provider: "discord", redirectPath: "/profile/" });
    } catch {
      alert(t("app.supabase_not_configured"));
    }
  };

  $("#btnLogin")?.addEventListener("click", onLogin);
  $("#btnLoginCenter")?.addEventListener("click", onLogin);

  const session = await syncAuthUI(sb);
  await initCurrentPage(sb, session);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.add("pt-ready");
    });
  });

  if (sb) {
    sb.auth.onAuthStateChange(async (_e, newSession) => {
      setLoggedInUI(newSession, readIdentity());
      if (newSession) saveIdentity(newSession);

      if (_e === 'INITIAL_SESSION') return;

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

  const isFirefox = navigator.userAgent.includes('Firefox');

  if (isFirefox) {
    document.getElementById('favicon').href = '/favicon-animate.svg';
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
