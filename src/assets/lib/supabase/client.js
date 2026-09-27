import { createClient } from "@supabase/supabase-js";

export const isDiscord = window.location.host.includes("discordsays.com") || new URLSearchParams(window.location.search).has("frame_id");

export function createSupabaseClient(cfg) {
  let url = cfg?.SUPABASE_URL;
  const anonKey = cfg?.SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  if (isDiscord) {
    url = `${window.location.origin}/_supabase`;
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}
