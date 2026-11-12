// The ONLY place that reads SUPABASE_SERVICE_ROLE_KEY. SERVER ONLY.
// The service-role key skips row-level security: it can read and write every shop's data. It must live only in
// Vercel's server environment variables. Never import this file from a screen, a component or a "use client" file.
// A test (lib/secrets.test.ts) fails if the key name appears anywhere else.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") throw new Error("The Supabase admin client runs on the server only.");

export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("The nightly job needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
