// Runs the AI provider over every item and keeps the answers next to the Forecast Desk's own forecast.
// Nothing here changes an order. An AI problem (free limit used up, service down, bad answer) is not an error
// for the owner: the run just saves what it got and says it stopped early. SERVER ONLY.
import { computeShopDesk } from "@/lib/desk-service";
import type { Store } from "@/lib/data/types";
import { collectAiForecasts } from "./run";
import { getAiMode, getForecaster } from "./registry";

export interface ShadowRunSummary {
  provider: string; runDate: string; saved: number; failed: number; firstError: string | null;
  /** Why the run stopped early, if it did: "limit" (free limit used up), "error" (service not working), "time". */
  stopped: "limit" | "error" | "time" | null;
}

/** Cap for one tap of the button. The page's function runs for at most 60 seconds (see app/api/ai/run/route.ts). */
const RUN_BUDGET_MS = 45_000;

export async function runShadow(store: Store): Promise<ShadowRunSummary> {
  const forecaster = getForecaster();
  if (!forecaster || getAiMode() === "off") throw new Error("AI forecasts are switched off.");

  const desk = await computeShopDesk(store, { useAi: false }); // the pure Forecast Desk answer, for a fair comparison
  const runDate = desk.asOf; // the shop's last complete day
  const got = await collectAiForecasts({
    forecaster, items: desk.items, results: desk.results, sales: desk.sales, calendar: desk.calendar, onOrder: desk.onOrder,
    asOf: desk.asOf, runDate, deadline: Date.now() + RUN_BUDGET_MS,
  });

  let saved = got.rows.length;
  let stopped = got.stopped;
  try {
    await store.saveAiForecasts(got.rows);
  } catch (e) {
    // For example the database is missing migration 0003. Not the owner's problem on this screen: log it and carry on.
    console.error(`ai run: could not save the AI forecasts: ${(e as Error).message}`);
    saved = 0;
    stopped ??= "error";
  }
  if (got.firstError) console.error(`ai run: ${got.failed} item(s) without an answer. First reason: ${got.firstError}`);
  return { provider: forecaster.id, runDate, saved, failed: got.failed, firstError: got.firstError, stopped };
}
