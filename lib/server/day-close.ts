// After "Close the day": run the Forecast Desk again for that one shop and save its rows, the way the nightly job does,
// so the scorecard can compare yesterday's forecast with what really sold. SERVER ONLY.
//
// The nightly job's database connection (the service key) is used because people cannot write these tables
// (row-level security). The shop id comes from the signed-in person's own shop (never from the request), and the
// route that calls this has already checked that the person is the owner on the product team.
import { adminClient } from "./supabase-admin";
import { supabaseNightlyDb } from "./nightly-supabase";
import { asOfDay } from "@/lib/dates";
import { runShopNightly } from "@/lib/nightly";

if (typeof window !== "undefined") throw new Error("This runs on the server only.");

export interface AfterCloseResult {
  saved: boolean;
  /** The last complete day the forecast was run for (the day that was just closed). */
  asOf: string | null;
  rows: number;
  /** In plain words, when the rows were not saved. The day itself was closed either way. */
  note: string | null;
}

export async function saveForecastsAfterClose(shopId: string): Promise<AfterCloseResult> {
  let db;
  try {
    db = supabaseNightlyDb(adminClient());
  } catch {
    return { saved: false, asOf: null, rows: 0, note: "The day is closed, but the forecast was not saved: the nightly job settings are missing on the server." };
  }
  try {
    const run = await runShopNightly(db, shopId, asOfDay(), { fillSampleDays: false });
    if (!run) return { saved: false, asOf: null, rows: 0, note: "The day is closed. There are no items to forecast." };
    const { rows } = run;
    return { saved: true, asOf: run.asOf, rows: rows.modelForecasts.length + rows.modelScores.length + rows.finalForecasts.length, note: null };
  } catch (e) {
    console.error(`close the day: forecast rows for shop ${shopId} were not saved: ${(e as Error).message}`);
    return { saved: false, asOf: null, rows: 0, note: "The day is closed, but the forecast was not saved this time. The nightly job will save it." };
  }
}
