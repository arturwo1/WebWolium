const DISCORD_TOKEN_URL = "https://discord.com/api/v10/oauth2/token";

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };
}

function getEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }

  return value;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, {
      error: "Method not allowed.",
      code: "METHOD_NOT_ALLOWED",
    });
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, {
      error: "Invalid JSON body.",
      code: "INVALID_JSON",
    });
  }

  const refreshToken = body.refresh_token;

  if (!refreshToken) {
    return json(400, {
      error: "refresh_token is required.",
      code: "NO_REFRESH_TOKEN",
    });
  }

  let clientId;
  let clientSecret;

  try {
    clientId = getEnv("DISCORD_CLIENT_ID");
    clientSecret = getEnv("DISCORD_CLIENT_SECRET");
  } catch (error) {
    return json(500, {
      error: error.message,
      code: "MISSING_ENV",
    });
  }

  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", refreshToken);

  const basic = Buffer
    .from(`${clientId}:${clientSecret}`)
    .toString("base64");

  const res = await fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    return json(res.status, {
      error: data?.error_description || data?.error || "Discord token refresh failed.",
      code: "DISCORD_REFRESH_FAILED",
    });
  }

  return json(200, {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    token_type: data.token_type,
    scope: data.scope,
  });
}