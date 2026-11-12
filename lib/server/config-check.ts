// Says WHETHER each setting exists (yes or no), never what it contains. SERVER ONLY.
// Used by /api/health so the set-up check can be public without touching a secret value.
import { getAiMode, getForecaster } from "@/lib/forecast/ai/registry";

if (typeof window !== "undefined") throw new Error("This runs on the server only.");

export function settingsPresent() {
  const mode = getAiMode();
  return {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), // needed by the nightly job only
    CRON_SECRET: Boolean(process.env.CRON_SECRET), // needed by the nightly job only
    DEMO_LOGIN: Boolean(process.env.DEMO_OWNER_EMAIL && process.env.DEMO_HELPER_EMAIL), // both demo emails are set (the "Demo login" form)
    AI_MODE: mode, // "off", "shadow" or "blend": a plain word, not a secret
    AI_FORECASTER: Boolean((process.env.AI_FORECASTER ?? "").trim()),
    AI_FORECAST_KEY: Boolean((process.env.AI_FORECAST_KEY ?? "").trim()), // yes or no only
    AI_READY: getForecaster() !== null, // AI is on AND the provider is set up (for gemini: the key exists)
  };
}
