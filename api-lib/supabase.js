import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./env.js";

let supabase;

export function getSupabaseClient() {
  if (!supabase) {
    const { supabaseUrl, supabaseServiceKey } = getEnv();
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { fetch: fetch },
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return supabase;
}
