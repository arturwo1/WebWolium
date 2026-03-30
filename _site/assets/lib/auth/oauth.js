export async function startOAuthLogin(sb, {
  provider = "discord",
  redirectPath = "/profile/"
} = {}) {
  if (!sb) throw new Error("SUPABASE_NOT_CONFIGURED");

  await sb.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${location.origin}${redirectPath}` }
  });
}
