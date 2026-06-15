export const DISCORD_AUTH_LOST_EVENT = "wolium:discord-auth-lost";

const FATAL_AUTH_CODES = new Set([
  "NO_SESSION",
  "NO_PROVIDER_REFRESH_TOKEN",
  "DISCORD_TOKEN_EXPIRED",
  "DISCORD_REFRESH_ERROR",
  "DISCORD_REFRESH_FAILED",
  "NO_DISCORD_ACCESS_TOKEN",
]);

const DISCORD_API_BASE = "https://discord.com/api/v10";
const REFRESH_ENDPOINT = "/.netlify/functions/discord-refresh-token";
const TOKEN_SKEW_MS = 60_000;

let cachedAccessToken = null;
let cachedRefreshToken = null;
let cachedExpiresAt = 0;

function emitDiscordAuthLost(error) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent(DISCORD_AUTH_LOST_EVENT, {
    detail: {
      code: error?.code || "DISCORD_AUTH_LOST",
      message: error?.message || "Discord auth lost",
    },
  }));
}

function maybeEmitDiscordAuthLost(error) {
  if (!FATAL_AUTH_CODES.has(error?.code)) return;
  emitDiscordAuthLost(error);
}

function isCachedTokenValid() {
  return cachedAccessToken && Date.now() < cachedExpiresAt - TOKEN_SKEW_MS;
}

function authError(message, code = "DISCORD_AUTH_ERROR") {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function readJsonSafe(res) {
  return await res.json().catch(() => null);
}

async function getSession(sb) {
  const { data, error } = await sb.auth.getSession();

  if (error) {
    throw authError(error.message, "SUPABASE_SESSION_ERROR");
  }

  if (!data?.session) {
    throw authError("Discord session was not found. Please sign in again.", "NO_SESSION");
  }

  return data.session;
}

async function refreshSupabaseSession(sb) {
  const { data, error } = await sb.auth.refreshSession();

  if (error) {
    throw authError(error.message, "SUPABASE_REFRESH_ERROR");
  }

  if (!data?.session) {
    throw authError("Discord session could not be refreshed. Please sign in again.", "NO_SESSION");
  }

  return data.session;
}

async function refreshDiscordToken(providerRefreshToken) {
  if (!providerRefreshToken) {
    throw authError(
      "Discord refresh token was not found. Please sign in again.",
      "NO_PROVIDER_REFRESH_TOKEN"
    );
  }

  const res = await fetch(REFRESH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refresh_token: providerRefreshToken,
    }),
  });

  const data = await readJsonSafe(res);

  if (!res.ok) {
    throw authError(
      data?.error || "Could not refresh Discord token.",
      data?.code || "DISCORD_REFRESH_ERROR"
    );
  }

  if (!data?.access_token) {
    throw authError("Discord did not return a new access token.", "NO_DISCORD_ACCESS_TOKEN");
  }

  cachedAccessToken = data.access_token;
  cachedRefreshToken = data.refresh_token || providerRefreshToken;
  cachedExpiresAt = Date.now() + Number(data.expires_in || 0) * 1000;

  return cachedAccessToken;
}

export function clearDiscordTokenCache() {
  cachedAccessToken = null;
  cachedRefreshToken = null;
  cachedExpiresAt = 0;
}

export async function getDiscordProviderToken(sb, options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);

  if (!forceRefresh && isCachedTokenValid()) {
    return cachedAccessToken;
  }

  let session = await getSession(sb);

  if (!forceRefresh && session.provider_token) {
    cachedRefreshToken = session.provider_refresh_token || cachedRefreshToken;
    return session.provider_token;
  }

  session = await refreshSupabaseSession(sb);

  const providerRefreshToken =
    session.provider_refresh_token ||
    cachedRefreshToken;

  if (!forceRefresh && session.provider_token) {
    cachedRefreshToken = providerRefreshToken || cachedRefreshToken;
    return session.provider_token;
  }

  return await refreshDiscordToken(providerRefreshToken);
}

export async function discordApiFetch(sb, path, options = {}) {
  const url = path.startsWith("http")
    ? path
    : `${DISCORD_API_BASE}${path}`;

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await getDiscordProviderToken(sb, {
        forceRefresh: attempt > 0,
      });

      const headers = new Headers(options.headers || {});
      headers.set("Authorization", `Bearer ${token}`);

      const res = await fetch(url, {
        ...options,
        headers,
      });

      if (res.status !== 401) {
        return res;
      }

      clearDiscordTokenCache();
    }

    throw authError(
      "Discord token expired. Please sign in again.",
      "DISCORD_TOKEN_EXPIRED"
    );
  } catch (error) {
    maybeEmitDiscordAuthLost(error);
    throw error;
  }
}