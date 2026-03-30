import { createClient } from "@supabase/supabase-js";

export function createSupabaseClient(cfg) {
  const url = cfg?.SUPABASE_URL;
  const anonKey = cfg?.SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}
