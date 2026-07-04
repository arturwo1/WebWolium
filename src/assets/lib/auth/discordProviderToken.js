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

let refreshLock = null;
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
  if (error) throw authError(error.message, "SUPABASE_SESSION_ERROR");
  if (!data?.session) throw authError("Discord session was not found. Please sign in again.", "NO_SESSION");
  return data.session;
}

async function refreshDiscordToken(sb, providerRefreshToken) {
  if (!providerRefreshToken) {
    throw authError("NO_REFRESH_TOKEN", "NO_REFRESH_TOKEN");
  }

  if (refreshLock) return refreshLock;

  refreshLock = (async () => {
    const session = await getSession(sb);

    const res = await fetch(REFRESH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ refresh_token: providerRefreshToken }),
    });

    const data = await readJsonSafe(res);

    if (!res.ok || !data?.access_token) {
      throw authError("DISCORD_REFRESH_FAILED", "DISCORD_REFRESH_FAILED");
    }

    cachedAccessToken = data.access_token;
    cachedRefreshToken = data.refresh_token;
    cachedExpiresAt = Date.now() + data.expires_in * 1000;

    await sb.from("discord_tokens").upsert(
      {
        user_id: session.user.id,
        refresh_token: data.refresh_token,
      },
      { onConflict: "user_id" }
    );

    return cachedAccessToken;
  })();

  try {
    return await refreshLock;
  } finally {
    refreshLock = null;
  }
}

export async function initDiscordAuth(sb) {
  const session = await getSession(sb);

  if (!session) return;

  const refreshToken = cachedRefreshToken || session.provider_refresh_token;

  if (!refreshToken) return;

  try {
    return await refreshDiscordToken(sb, refreshToken);
  } catch (err) {
    maybeEmitDiscordAuthLost(err);
    throw err;
  }
}

export function logout(error = null) {
  emitDiscordAuthLost(error);
}

export function clearDiscordTokenCache() {
  cachedAccessToken = null;
  cachedRefreshToken = null;
  cachedExpiresAt = 0;
}

export async function initDiscordTokenCache(sb) {
  const { data, error } = await sb
    .from("discord_tokens")
    .select("refresh_token")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("discord_tokens init error:", error);
    return;
  }

  if (data?.refresh_token) {
    cachedRefreshToken = data.refresh_token;
  }
}

export async function getDiscordProviderToken(sb) {
  if (isCachedTokenValid()) return cachedAccessToken;

  const session = await getSession(sb);

  if (session.provider_token) {
    cachedAccessToken = session.provider_token;
    cachedRefreshToken = session.provider_refresh_token || cachedRefreshToken;
    cachedExpiresAt = Date.now() + 3600 * 1000;

    return cachedAccessToken;
  }

  const refreshToken = cachedRefreshToken || session.provider_refresh_token;

  if (!refreshToken) {
    const err = authError("NO_REFRESH_TOKEN", "NO_REFRESH_TOKEN");
    maybeEmitDiscordAuthLost(err);
    throw err;
  }

  try {
    return await refreshDiscordToken(sb, refreshToken);
  } catch (err) {
    maybeEmitDiscordAuthLost(err);
    throw err;
  }
}

export async function discordApiFetch(sb, path, options = {}) {
  const url = path.startsWith("http")
    ? path
    : `${DISCORD_API_BASE}${path}`;

  let token = await getDiscordProviderToken(sb);

  let res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401) {
    clearDiscordTokenCache();

    token = await getDiscordProviderToken(sb);

    res = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return res;
}