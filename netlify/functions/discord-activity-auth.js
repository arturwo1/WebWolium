import { createClient } from "@supabase/supabase-js";

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
  if (event.httpMethod !== "POST") {
    return json(405, { error: "METHOD_NOT_ALLOWED" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  const code = body.code;
  if (!code) {
    return json(400, { error: "NO_CODE" });
  }

  const clientId = getEnv("DISCORD_CLIENT_ID");
  const clientSecret = getEnv("DISCORD_CLIENT_SECRET");

  const form = new URLSearchParams();
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("grant_type", "authorization_code");
  form.set("code", code);

  const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });

  const tokenData = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !tokenData?.access_token) {
    return json(401, { error: "DISCORD_TOKEN_EXCHANGE_FAILED", details: tokenData });
  }

  const userRes = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const discordUser = await userRes.json().catch(() => null);

  if (!userRes.ok || !discordUser?.id) {
    return json(401, { error: "DISCORD_USER_FETCH_FAILED" });
  }

  const supabase = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const email = discordUser.email || `${discordUser.id}@discord.wolium.app`;
  const fullName = discordUser.global_name || discordUser.username;
  const avatarUrl = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
    : null;

  let linkRes = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: email,
  });

  let targetUser = linkRes.data?.user;

  if (linkRes.error || !targetUser) {
    const createRes = await supabase.auth.admin.createUser({
      email: email,
      email_confirm: true,
      user_metadata: {
        name: fullName,
        full_name: fullName,
        username: discordUser.username,
        avatar_url: avatarUrl,
        discord_id: discordUser.id,
      },
    });

    if (createRes.error) {
      return json(500, { error: "SUPABASE_CREATE_USER_FAILED", details: createRes.error.message });
    }

    targetUser = createRes.data.user;

    linkRes = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: email,
    });
  }

  const tokenHash = linkRes.data?.properties?.hashed_token;
  if (!tokenHash) {
    return json(500, { error: "FAILED_TO_GENERATE_TOKEN_HASH" });
  }

  if (tokenData.refresh_token) {
    await supabase.from("discord_tokens").upsert(
      {
        user_id: targetUser.id,
        refresh_token: tokenData.refresh_token,
      },
      { onConflict: "user_id" }
    );
  }

  return json(200, {
    token_hash: tokenHash,
    email: email,
    discord_access_token: tokenData.access_token,
    discord_user: discordUser,
  });
}