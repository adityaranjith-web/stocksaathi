// The nightly job: runs the Forecast Desk for every shop and saves what it found (BRD FR4).
// This file holds the logic only. It talks to the database through the small NightlyDb interface, so it can be
// tested with a fake one. The real database connection lives in lib/server/ (server only).
import { addDays, type CalendarDay, type DeskResult } from "@/lib/forecast/desk";
import { asOfDay } from "@/lib/dates";
import { runShopDesk } from "@/lib/desk-service";
import { collectAiForecasts } from "@/lib/forecast/ai/run";
import type { Forecaster } from "@/lib/forecast/ai/types";
import type { AiForecastRow, Item, Sale } from "@/lib/data/types";

/** Days of sales the Forecast Desk looks at (the same as when a screen opens). */
export const NIGHTLY_LOOKBACK_DAYS = 56;

// Row shapes match the tables model_forecasts, model_scores and final_forecasts.
export interface ModelForecastRow { shop_id: string; item_id: string; run_date: string; model: string; units_per_day: number }
export interface ModelScoreRow { shop_id: string; item_id: string; run_date: string; model: string; error_14d: number; weight: number }
export interface FinalForecastRow {
  shop_id: string; item_id: string; run_date: string; units_per_day: number; spread: number;
  confidence: string; status: string; order_qty: number; horizon_days: number;
}
export interface NightlyRows { modelForecasts: ModelForecastRow[]; modelScores: ModelScoreRow[]; finalForecasts: FinalForecastRow[] }

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r4 = (x: number) => Math.round(x * 10000) / 10000;

/**
 * Turns the Forecast Desk results for one shop into rows to save.
 * - model_forecasts: each model's forecast (units per day over the order horizon). New and slow items have only M2.
 * - model_scores: each model's average miss over the last 14 days, and the weight it got.
 * - final_forecasts: the blended forecast that the reorder list used, with its spread, confidence, decision and horizon.
 */
export function buildForecastRows(shopId: string, runDate: string, items: Pick<Item, "id" | "leadTimeDays" | "orderCoverDays">[], results: Map<string, DeskResult>): NightlyRows {
  const rows: NightlyRows = { modelForecasts: [], modelScores: [], finalForecasts: [] };
  for (const it of items) {
    const r = results.get(it.id);
    if (!r) continue;
    for (const m of r.members) {
      rows.modelForecasts.push({ shop_id: shopId, item_id: it.id, run_date: runDate, model: m.model, units_per_day: r3(m.forecast) });
      rows.modelScores.push({ shop_id: shopId, item_id: it.id, run_date: runDate, model: m.model, error_14d: r3(m.mae), weight: r4(m.weight) });
    }
    rows.finalForecasts.push({
      shop_id: shopId, item_id: it.id, run_date: runDate, units_per_day: r3(r.forecast), spread: r3(r.spread), confidence: r.confidence,
      status: r.decision.status, order_qty: r.decision.orderQty, horizon_days: it.leadTimeDays + it.orderCoverDays,
    });
  }
  return rows;
}

export interface ShopData { items: Item[]; sales: Sale[]; calendar: CalendarDay[]; onOrder: Record<string, number> }

/** What the job needs from the database. The real one is in lib/server/nightly-supabase.ts. */
export interface NightlyDb {
  listShopIds(): Promise<string[]>;
  loadShop(shopId: string, salesSince: string): Promise<ShopData>;
  /** Saves rows. Saving the same night twice replaces the rows, it never doubles them. */
  saveRows(rows: NightlyRows): Promise<void>;
  /** Saves AI second-opinion rows for one shop (shadow mode). Only needed when an AI provider is set up. */
  saveAiRows?(shopId: string, rows: AiForecastRow[]): Promise<void>;
}

export interface NightlySummary {
  runDate: string; shops: number; skippedShops: number; failedShops: number; items: number; rows: number;
  /** The AI second opinion. It never makes the job fail: a busy or out-of-limit AI just shows up here. */
  ai: { provider: string | null; saved: number; failed: number; stopped: "limit" | "error" | "time" | null };
}

/** The AI step must finish well inside the route's 60 seconds (app/api/cron/nightly/route.ts). */
export const NIGHTLY_AI_BUDGET_MS = 40_000;

/**
 * Runs the Forecast Desk for every shop. One shop failing never stops the others: the failure is logged
 * (with the shop's id, never any secret) and counted in failedShops.
 */
export async function runNightly(
  db: NightlyDb, runDate: string = asOfDay(),
  opts: { forecaster?: Forecaster | null; aiBudgetMs?: number; now?: () => number } = {},
): Promise<NightlySummary> {
  const forecaster = opts.forecaster ?? null;
  const now = opts.now ?? Date.now;
  const aiDeadline = now() + (opts.aiBudgetMs ?? NIGHTLY_AI_BUDGET_MS);
  const summary: NightlySummary = { runDate, shops: 0, skippedShops: 0, failedShops: 0, items: 0, rows: 0, ai: { provider: forecaster?.id ?? null, saved: 0, failed: 0, stopped: null } };
  const since = addDays(runDate, -(NIGHTLY_LOOKBACK_DAYS - 1));
  const ids = await db.listShopIds();
  for (const shopId of ids) {
    try {
      const data = await db.loadShop(shopId, since);
      if (!data.items.length) { summary.skippedShops++; continue; }
      // The same function the screens use, with the last complete day as "today".
      const results = runShopDesk({ asOf: runDate, items: data.items, sales: data.sales, calendar: data.calendar, onOrder: data.onOrder });
      const rows = buildForecastRows(shopId, runDate, data.items, results);
      await db.saveRows(rows);
      summary.shops++;
      summary.items += rows.finalForecasts.length;
      summary.rows += rows.modelForecasts.length + rows.modelScores.length + rows.finalForecasts.length;
      // The Forecast Desk rows are safe. Now, if an AI is set up, ask it for a second opinion. Whatever happens here,
      // it never fails the shop or the job: the Desk's own rows above are already saved.
      if (forecaster && db.saveAiRows && summary.ai.stopped !== "limit" && summary.ai.stopped !== "time") {
        await runAiStep(db, forecaster, shopId, data, results, runDate, aiDeadline, now, summary);
      }
    } catch (e) {
      summary.failedShops++;
      console.error(`nightly: shop ${shopId} failed: ${(e as Error).message}`);
    }
  }
  return summary;
}

async function runAiStep(
  db: NightlyDb, forecaster: Forecaster, shopId: string, data: ShopData, results: Map<string, DeskResult>,
  runDate: string, deadline: number, now: () => number, summary: NightlySummary,
) {
  try {
    const got = await collectAiForecasts({ forecaster, items: data.items, results, sales: data.sales, calendar: data.calendar, onOrder: data.onOrder, asOf: runDate, runDate, deadline, now });
    if (got.rows.length) await db.saveAiRows!(shopId, got.rows);
    summary.ai.saved += got.rows.length;
    summary.ai.failed += got.failed;
    if (got.stopped) summary.ai.stopped = got.stopped;
    if (got.firstError) console.error(`nightly: AI second opinion for shop ${shopId}: ${got.failed} item(s) without an answer. First reason: ${got.firstError}`);
  } catch (e) {
    summary.ai.stopped = "error";
    console.error(`nightly: AI second opinion for shop ${shopId} could not be saved: ${(e as Error).message}`);
  }
}
