import { createClient } from "@supabase/supabase-js";

const DISCORD_TOKEN_URL = "https://discord.com/api/v10/oauth2/token";

const refreshLocks = new Map();

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function getEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export async function handler(event) {
  console.log("DISCORD REFRESH HIT", Date.now());
  if (event.httpMethod !== "POST") {
    return json(405, { error: "METHOD_NOT_ALLOWED", code: "METHOD_NOT_ALLOWED" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "INVALID_JSON", code: "INVALID_JSON" });
  }

  const refreshToken = body.refresh_token;
  if (!refreshToken) {
    return json(400, { error: "NO_REFRESH_TOKEN", code: "NO_REFRESH_TOKEN" });
  }

  const jwt = event.headers["authorization"]?.replace("Bearer ", "");
  if (!jwt) {
    return json(401, { error: "UNAUTHORIZED", code: "UNAUTHORIZED" });
  }

  const supabase = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { data, error } = await supabase.auth.getUser(jwt);

  if (error || !data?.user) {
    return json(401, { error: "INVALID_SESSION", code: "INVALID_SESSION" });
  }

  const user = data.user;

  const basic = Buffer.from(
    `${getEnv("DISCORD_CLIENT_ID")}:${getEnv("DISCORD_CLIENT_SECRET")}`
  ).toString("base64");

  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", refreshToken);

  const res = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  const token = await res.json().catch(() => null);

  if (!res.ok || !token?.access_token || !token?.refresh_token) {
    return json(500, {
      error: "DISCORD_REFRESH_FAILED",
      code: "DISCORD_REFRESH_FAILED",
    });
  }

  const { error: upsertError } = await supabase
    .from("discord_tokens")
    .upsert(
      {
        user_id: user.id,
        refresh_token: token.refresh_token,
      },
      { onConflict: "user_id" }
    );

  if (upsertError) {
    return json(500, {
      error: "SUPABASE_WRITE_FAILED",
      code: "SUPABASE_WRITE_FAILED",
    });
  }

  return json(200, {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_in: token.expires_in,
  });
}