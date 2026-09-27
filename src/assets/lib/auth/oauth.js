export async function loginViaDiscordActivity(sb, discordSdk, { silent = true } = {}) {
  if (!discordSdk) return null;

  const { data: cur } = await sb.auth.getSession();
  if (cur?.session && cur.session.expires_at * 1000 > Date.now()) {
    return cur.session;
  }

  const { code } = await discordSdk.commands.authorize({
    client_id: "1051105900116574250",
    response_type: "code",
    state: "",
    prompt: silent ? "none" : undefined,
    scope: ["identify", "guilds", "email"],
  });

  const res = await fetch("/.netlify/functions/discord-activity-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  const data = await res.json();
  if (!res.ok || !data?.token_hash) {
    throw new Error(data?.error || "Discord Activity Auth Failed");
  }

  const { data: authData, error } = await sb.auth.verifyOtp({
    token_hash: data.token_hash,
    type: "email",
  });

  if (error) throw error;

  return authData.session;
}

export async function startOAuthLogin(sb, {
  provider = "discord",
  redirectPath = window.location.pathname + window.location.search
} = {}) {
  if (!sb) throw new Error("SUPABASE_NOT_CONFIGURED");

  await sb.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${location.origin}${redirectPath}`,
      scopes: "guilds"
    }
  });
}
