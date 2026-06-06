import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

let admin = null;

export function supabaseAdmin() {
  if (admin) return admin;

  admin = createClient(
    env("SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  return admin;
}
