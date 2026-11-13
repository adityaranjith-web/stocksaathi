// Builds each item's daily sales series and runs the Forecast Desk for the whole shop.
import { addDays, runDesk, type DeskResult, type SalesSeries } from "@/lib/forecast/desk";
import { applyColdStart, type ColdStartInfo } from "@/lib/cold-start";
import { asOfFor } from "@/lib/business-day";
import type { Distributor, Item, Sale, Store } from "@/lib/data/types";
import { getAiMode, getForecaster } from "@/lib/forecast/ai/registry";
import { evaluateShadow, shouldPromote } from "@/lib/forecast/ai/evaluate";
import { applyAiBlend } from "@/lib/forecast/ai/apply";

const LOOKBACK_DAYS = 56;

export function buildSeries(itemId: string, sales: { date: string; itemId: string; qty: number }[], asOf: string): SalesSeries {
  const mine = sales.filter((s) => s.itemId === itemId && s.date <= asOf);
  const first = mine.reduce((m, s) => (s.date < m ? s.date : m), asOf);
  const start = first > addDays(asOf, -(LOOKBACK_DAYS - 1)) ? first : addDays(asOf, -(LOOKBACK_DAYS - 1));
  const byDate = new Map<string, number>();
  for (const s of mine) if (s.date >= start) byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.qty);
  const dates: string[] = [];
  for (let d = start; d <= asOf; d = addDays(d, 1)) dates.push(d);
  return { dates, qty: dates.map((d) => byDate.get(d) ?? 0) };
}

/**
 * Runs the Forecast Desk for every item of one shop, from data already loaded. No database, no AI.
 * Used by the screens (through computeShopDesk) and by the nightly job, so both always give the same answer.
 * A new item that has the owner's own estimate and fewer than 14 days of sales gets the cold-start blend instead
 * (lib/cold-start.ts). Every other item, and every item with 14 or more days of sales, gets the Forecast Desk's own result, untouched.
 */
export function runShopDeskDetailed(args: {
  asOf: string; items: Item[]; sales: { date: string; itemId: string; qty: number }[];
  calendar: { date: string; name: string; upliftPct: number }[]; onOrder: Record<string, number>;
}): { results: Map<string, DeskResult>; coldStart: Map<string, ColdStartInfo> } {
  const results = new Map<string, DeskResult>();
  const coldStart = new Map<string, ColdStartInfo>();
  for (const it of args.items) {
    const input = { itemId: it.id, leadTimeDays: it.leadTimeDays, minSafetyStock: it.minSafetyStock, orderCoverDays: it.orderCoverDays, currentStock: it.currentStock, onOrder: args.onOrder[it.id] ?? 0 };
    const series = buildSeries(it.id, args.sales, args.asOf);
    const base = runDesk(input, series, args.calendar);
    const cold = applyColdStart(base, input, series, it.estimatedPerDay);
    results.set(it.id, cold ? cold.result : base);
    if (cold) coldStart.set(it.id, cold.info);
  }
  return { results, coldStart };
}

export function runShopDesk(args: Parameters<typeof runShopDeskDetailed>[0]): Map<string, DeskResult> {
  return runShopDeskDetailed(args).results;
}

export interface ShopDesk {
  asOf: string;
  items: Item[];
  distributors: Distributor[];
  results: Map<string, DeskResult>;
  /** Items whose forecast is the owner's own estimate blended with real sales (fewer than 14 days of sales). */
  coldStart: Map<string, ColdStartInfo>;
  onOrder: Record<string, number>;
  /** The shop's "today" (see lib/business-day.ts) and the real date. The Desk works up to the day before the business date. */
  businessDate: string;
  realDate: string;
  simulated: boolean;
  todaySales: { units: number; value: number };
  sales: Sale[]; // the last 56 days of sales, kept so other screens do not have to fetch them again
  calendar: { date: string; name: string; upliftPct: number }[];
}

/**
 * useAi=false gives the pure Forecast Desk answer. The AI step only runs when AI_MODE is "blend",
 * a provider is set up, and the AI has passed the checks in shouldPromote (see docs/ai-integration.md).
 */
export async function computeShopDesk(store: Store, opts: { useAi?: boolean } = {}): Promise<ShopDesk> {
  // The shop's own "today". In live mode this reads the same snapshot as everything below, so it costs no extra call.
  const day = await store.getBusinessDay();
  const asOf = asOfFor(day.date);
  const [items, distributors, sales, calendar, onOrder] = await Promise.all([
    store.listItems(), store.listDistributors(), store.listSales(addDays(asOf, -(LOOKBACK_DAYS - 1))), store.listCalendar(), store.openOrderQty(),
  ]);
  const { results, coldStart } = runShopDeskDetailed({ asOf, items, sales, calendar, onOrder });
  const inputs = new Map<string, Parameters<typeof runDesk>[0]>(
    items.map((it) => [it.id, { itemId: it.id, leadTimeDays: it.leadTimeDays, minSafetyStock: it.minSafetyStock, orderCoverDays: it.orderCoverDays, currentStock: it.currentStock, onOrder: onOrder[it.id] ?? 0 }]),
  );

  const forecaster = opts.useAi === false || getAiMode() !== "blend" ? null : getForecaster();
  if (forecaster) {
    const aiRows = (await store.listAiForecasts(addDays(asOf, -(LOOKBACK_DAYS - 1)))).filter((r) => r.provider === forecaster.id);
    if (shouldPromote(evaluateShadow(aiRows, sales, asOf)).promote) {
      const today = new Map(aiRows.filter((r) => r.runDate === asOf).map((r) => [r.itemId, r]));
      for (const it of items) {
        const r = results.get(it.id)!;
        const horizon = it.leadTimeDays + it.orderCoverDays;
        const festivalAhead = calendar.some((c) => c.date > asOf && c.date <= addDays(asOf, horizon));
        results.set(it.id, applyAiBlend(r, inputs.get(it.id)!, today.get(it.id), festivalAhead));
      }
    }
  }

  const price = new Map(items.map((i) => [i.id, i.price]));
  const todays = sales.filter((s) => s.date > asOf && s.date <= day.date); // only the business date itself: not days closed ahead
  return {
    asOf, items, distributors, results, coldStart, onOrder, sales, calendar, businessDate: day.date, realDate: day.realDate, simulated: day.simulated,
    todaySales: { units: todays.reduce((a, s) => a + s.qty, 0), value: todays.reduce((a, s) => a + s.qty * (price.get(s.itemId) ?? 0), 0) },
  };
}
