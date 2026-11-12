// Says WHETHER each setting exists (yes or no), never what it contains. SERVER ONLY.
// Used by /api/health so the set-up check can be public without touching a secret value.
if (typeof window !== "undefined") throw new Error("This runs on the server only.");

export function settingsPresent() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), // needed by the nightly job only
    CRON_SECRET: Boolean(process.env.CRON_SECRET), // needed by the nightly job only
  };
}
