import CFG from "./config.js";

import {
  bindHeadImages,
  isDiscord,
  createSupabaseClient,
  initDrawer,
  initDropdown,
  isPublicPage,
  readIdentity,
  registerServiceWorker,
  saveIdentity,
  setLoggedInUI,
  showGate,
  showShell,
  loginViaDiscordActivity,
  startOAuthLogin,
  highlightNav,
  initConsent,
  lsDel,
  ttlGet,
  ttlSet,
  $,
  initI18n,
  applyDomI18n,
  t
} from "@/lib/index.js";

import { createWebRequestService } from "@/services/index.js";

import { DISCORD_AUTH_LOST_EVENT, clearDiscordTokenCache, initDiscordTokenCache, initDiscordAuth } from "@/lib/auth/discordProviderToken.js";

import { initPageTransitions } from "@/lib/ui/pageTransitions.js";

import "highlight.js/styles/github-dark.css";

const DISCORD_PARAM_KEYS = ["frame_id", "instance_id", "platform"];

const params = new URLSearchParams(window.location.search);
const isOnDiscordHost = window.location.host.includes("discordsays.com");

if (params.has("frame_id")) {
  for (const key of DISCORD_PARAM_KEYS) {
    if (params.has(key)) sessionStorage.setItem(`discord_${key}`, params.get(key));
  }
} else if (isOnDiscordHost) {
  let changed = false;
  for (const key of DISCORD_PARAM_KEYS) {
    const cached = sessionStorage.getItem(`discord_${key}`);
    if (cached && !params.has(key)) {
      params.set(key, cached);
      changed = true;
    }
  }
  if (changed) {
    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    history.replaceState(null, "", newUrl);
  }
}

let discordSdk = null;

if (params.has("frame_id") && params.has("instance_id")) {
  try {
    const { DiscordSDK } = await import("@discord/embedded-app-sdk");
    discordSdk = new DiscordSDK("1051105900116574250");
  } catch (e) {
    console.warn("[app] DiscordSDK init skipped:", e);
  }
}

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

    if (session && session.expires_at * 1000 < Date.now()) {
      const { data: refreshed } = await sb.auth.refreshSession();
      session = refreshed?.session || null;
    }
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
  if (!pid || started.has(pid)) return;

  const authPages = ["profile", "settings", "leaderboard", "server", "servers"];
  if (authPages.includes(pid) && !session) return;

  started.add(pid);

  switch (pid) {
    case "login":
      await showGate();
      break;
    case "home": {
      const { initHomePage } = await import("./pages/index.js");
      await initHomePage();
      break;
    }
    case "profile": {
      const { initProfilePage } = await import("./pages/profile.js");
      await initProfilePage(sb);
      break;
    }
    case "settings": {
      const { initSettingsPage } = await import("./pages/settings.js");
      await initSettingsPage(sb);
      break;
    }
    case "news": {
      const { initNewsPage } = await import("./pages/news.js");
      await initNewsPage();
      break;
    }
    case "leaderboard": {
      const { initLeaderboardPage } = await import("./pages/leaderboard.js");
      await initLeaderboardPage(sb);
      break;
    }
    case "server": {
      const { initServerPage } = await import("./pages/server.js");
      await initServerPage(sb);
      break;
    }
    case "servers": {
      const { initServersPage } = await import("./pages/servers.js");
      await initServersPage(sb);
      break;
    }
  }
}

async function boot() {
  await initI18n();
  initConsent();

  const btnAvatar = $("#btnAvatar");
  const userDropdown = $("#userDropdown");

  const btnChartOptions = $("#btnChartOptions");
  const chartOptionsDropdown = $("#chartOptionsDropdown");

  initPageTransitions();

  setTimeout(() => {
    document.documentElement.classList.add("pt-ready");
  }, 50);

  if (!isDiscord) {
    registerServiceWorker();
  }

  // bindHeadImages();

  highlightNav();
  initDrawer();

  const sb = createSupabaseClient(CFG);
  window.sb = sb;
  if (!sb) console.error("[app] Supabase client not configured.");

  let authLostHandling = false;

  async function handleDiscordAuthLost() {
    if (authLostHandling) return;
    authLostHandling = true;

    try {
      clearDiscordTokenCache();
      lsDel("wolium:last_identity");
      started.clear();

      await sb?.auth?.signOut();

      setLoggedInUI(null, null);
      showGate();
    } finally {
      authLostHandling = false;
    }
  }

  window.addEventListener(DISCORD_AUTH_LOST_EVENT, handleDiscordAuthLost);

  initDropdown({
    button: btnAvatar,
    dropdown: userDropdown,
    onAction: async () => {
      clearDiscordTokenCache();
      lsDel("wolium:last_identity");
      await sb?.auth?.signOut();
      started.clear();
      await syncAuthUI(sb);
    }
  });

  initDropdown({
    button: btnChartOptions,
    dropdown: chartOptionsDropdown
  });

  const onLogin = async () => {
    if (isDiscord) {
      if (!discordSdk || !sb) {
        alert(t("app.supabase_not_configured"));
        return;
      }
      try {
        const session = await Promise.race([
          loginViaDiscordActivity(sb, discordSdk, { silent: false }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Login timed out")), 15000)
          ),
        ]);
        if (session) await syncAuthUI(sb);
      } catch (e) {
        console.error("[app] Discord Activity login failed:", e);
        alert(t("app.login_failed"));
      }
      return;
    }

    try {
      await startOAuthLogin(sb, { provider: "discord" });
    } catch {
      alert(t("app.supabase_not_configured"));
    }
  };

  $("#btnLogin")?.addEventListener("click", onLogin);
  $("#btnLoginCenter")?.addEventListener("click", onLogin);

  let session = await syncAuthUI(sb);

  if (!session && isDiscord && discordSdk && sb) {
    try {
      await Promise.race([
        discordSdk.ready(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("discordSdk.ready() timed out after 2000ms")), 2000)
        ),
      ]);
      await loginViaDiscordActivity(sb, discordSdk);
      session = await syncAuthUI(sb);
    } catch (e) {
      console.warn("[app] Silent Discord Activity login skipped:", e.message);
    }
  }

  if (session && isDiscord && sb) {
    try {
      const wr = createWebRequestService(sb, {
        defaultCacheTtlMs: 0,
        defaultCooldownMs: 0,
        defaultTimeoutMs: 3_000
      });

      const res = await wr.queue("get_activity_redirect", {}, { timeoutMs: 3_000 });

      const createRedirectUrl = (path) => {
        const targetUrl = new URL(path, window.location.origin);
        const currentParams = new URLSearchParams(window.location.search);
        for (const key of DISCORD_PARAM_KEYS) {
          if (currentParams.has(key)) {
            targetUrl.searchParams.set(key, currentParams.get(key));
          }
        }
        return targetUrl.toString();
      };

      if (res?.target_path) {
        ttlSet('last_activity_path', res.target_path, 5 * 60 * 1000);
        window.location.href = createRedirectUrl(res.target_path);
        return;
      }

      const savedPath = ttlGet('last_activity_path');
      if (savedPath && window.location.pathname === '/') {
        window.location.href = createRedirectUrl(savedPath);
        return;
      }

    } catch (e) {
      console.warn("[app] Activity redirect fetch failed:", e);
    }
  }

  if (session) {
    try {
      await initDiscordTokenCache(sb);
      await initDiscordAuth(sb);
    } catch (e) {
      console.warn("[app] Discord token refresh error:", e);
    }
  }

  await initCurrentPage(sb, session);

  window.dispatchEvent(new Event("app:page-ready"));

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

  function activitySearch(search) {
    const src = new URLSearchParams(search);
    const kept = new URLSearchParams();
    for (const k of DISCORD_PARAM_KEYS) if (src.has(k)) kept.set(k, src.get(k));
    const s = kept.toString();
    return s ? `?${s}` : "";
  }

  if (isDiscord) {
    document.addEventListener("click", (e) => {
      const link = e.target.closest("a");
      if (link && link.href && link.origin === window.location.origin) {
        const url = new URL(link.href);
        if (!url.search) {
          const s = activitySearch(window.location.search);
          if (s) {
            e.preventDefault();
            url.search = s;
            window.location.href = url.toString();
          }
        }
      }
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
