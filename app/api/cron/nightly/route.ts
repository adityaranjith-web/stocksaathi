import { handleNightly } from "@/lib/server/nightly-handler";
import { adminClient } from "@/lib/server/supabase-admin";
import { supabaseNightlyDb } from "@/lib/server/nightly-supabase";
import { getForecaster } from "@/lib/forecast/ai/registry";

// Called once a day by a Vercel cron (see vercel.json). Needs the header  Authorization: Bearer <CRON_SECRET>.
// Vercel adds that header by itself when the CRON_SECRET environment variable is set.
// When AI_MODE is "shadow" or "blend" and an AI provider is set up, it also saves the AI second opinion for each item.
export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds

export async function GET(req: Request) {
  return handleNightly(req, { secret: process.env.CRON_SECRET, makeDb: () => supabaseNightlyDb(adminClient()), forecaster: getForecaster() });
}
