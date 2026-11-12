// Gathers the data for the weekly scorecard and runs the calculations in lib/scorecard.ts.
import { addDays } from "@/lib/forecast/desk";
import { asOfDay, todayIST } from "@/lib/dates";
import { buildSeries, computeShopDesk } from "@/lib/desk-service";
import { compareForecastError, evaluateSavedForecasts, outOfStockItemDays, SAVED_MIN, slowStockValue } from "@/lib/scorecard";
import { averagePrepSeconds } from "@/lib/prep-time";
import type { Store } from "@/lib/data/types";

/**
 * Forecast error of the blend against the plain 28-day average.
 * source "saved": measured on forecasts the nightly job saved, checked against what really sold.
 * source "back-test": there are not enough saved forecasts yet, so each recent day is re-forecast from earlier days only.
 */
export interface ForecastError {
  source: "saved" | "back-test";
  forecasts: number; // saved forecasts checked (saved) or items tested (back-test)
  nights: number; // nights covered (saved only)
  blendError: number;
  simpleError: number;
  improvementPct: number | null;
}

export interface Scorecard {
  asOf: string;
  stockouts: { itemDays: number; possibleItemDays: number; ratePct: number; topItems: number; lastWeekItemDays: number };
  error: ForecastError;
  slow: { value: number; items: number };
  prep: { averageSeconds: number | null; orders: number };
}

export async function buildScorecard(store: Store): Promise<Scorecard> {
  // Everything is asked for at the same time (they depend only on today's date, not on each other), so the scorecard
  // waits for one round trip to the database, not three in a row.
  // The shop's own "today" can be ahead of the real date, never behind it. So the windows below are measured from the real
  // date (they only ever ask for a little more), and the calculations use the shop's date (desk.asOf).
  const realAsOf = asOfDay();
  const [desk, deliveries, orders, saved] = await Promise.all([
    computeShopDesk(store),
    store.listDeliveries(addDays(realAsOf, -20)),
    store.listOrders(addDays(todayIST(), -6)),
    store.listSavedForecasts(addDays(realAsOf, -60)),
  ]);
  const asOf = desk.asOf;
  const stock = { items: desk.items.map((i) => ({ id: i.id, currentStock: i.currentStock })), sales: desk.sales, deliveries: deliveries.map((d) => ({ date: d.date, itemId: d.itemId, qty: d.qty })), asOf };

  const thisWeek = outOfStockItemDays(stock);
  const lastWeek = outOfStockItemDays({ ...stock, endOffsetDays: 7 });

  // Forecast accuracy comes from the rows the nightly job saved (top 20 items, last 4 weeks of nights).
  // Until there are enough of them, fall back to a back-test so the screen is never empty.
  const top = new Set(thisWeek.topItemIds);
  const ev = evaluateSavedForecasts(saved, desk.sales, asOf, { fromRunDate: addDays(asOf, -27), itemIds: top });
  let error: ForecastError;
  if (ev.forecasts >= SAVED_MIN.forecasts && ev.nights >= SAVED_MIN.nights) {
    error = { source: "saved", forecasts: ev.forecasts, nights: ev.nights, blendError: ev.blendError, simpleError: ev.simpleError, improvementPct: ev.improvementPct };
  } else {
    const bt = compareForecastError(thisWeek.topItemIds.map((id) => buildSeries(id, desk.sales, asOf)), desk.calendar, 7);
    error = { source: "back-test", forecasts: bt.items, nights: 0, blendError: bt.blendError, simpleError: bt.simpleError, improvementPct: bt.improvementPct };
  }

  const slowRows = desk.items.map((i) => ({ stock: i.currentStock, price: i.price, slow: desk.results.get(i.id)?.decision.status === "Don't reorder" }));

  return {
    asOf,
    stockouts: { itemDays: thisWeek.itemDays, possibleItemDays: thisWeek.possibleItemDays, ratePct: thisWeek.ratePct, topItems: thisWeek.topItemIds.length, lastWeekItemDays: lastWeek.itemDays },
    error,
    slow: { value: slowStockValue(slowRows), items: slowRows.filter((r) => r.slow).length },
    prep: { averageSeconds: averagePrepSeconds(orders.map((o) => o.prepSeconds)), orders: orders.filter((o) => o.prepSeconds !== null).length },
  };
}
