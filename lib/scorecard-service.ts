// Gathers the data for the weekly scorecard and runs the calculations in lib/scorecard.ts.
import { addDays } from "@/lib/forecast/desk";
import { todayIST } from "@/lib/dates";
import { buildSeries, computeShopDesk } from "@/lib/desk-service";
import { compareForecastError, outOfStockItemDays, slowStockValue, type ErrorComparison } from "@/lib/scorecard";
import { averagePrepSeconds } from "@/lib/prep-time";
import type { Store } from "@/lib/data/types";

export interface Scorecard {
  asOf: string;
  stockouts: { itemDays: number; possibleItemDays: number; ratePct: number; topItems: number; lastWeekItemDays: number };
  error: ErrorComparison;
  slow: { value: number; items: number };
  prep: { averageSeconds: number | null; orders: number };
}

export async function buildScorecard(store: Store): Promise<Scorecard> {
  const desk = await computeShopDesk(store);
  const asOf = desk.asOf;
  const [deliveries, orders] = await Promise.all([store.listDeliveries(addDays(asOf, -20)), store.listOrders(addDays(todayIST(), -6))]);
  const stock = { items: desk.items.map((i) => ({ id: i.id, currentStock: i.currentStock })), sales: desk.sales, deliveries: deliveries.map((d) => ({ date: d.date, itemId: d.itemId, qty: d.qty })), asOf };

  const thisWeek = outOfStockItemDays(stock);
  const lastWeek = outOfStockItemDays({ ...stock, endOffsetDays: 7 });

  const topSeries = thisWeek.topItemIds.map((id) => buildSeries(id, desk.sales, asOf));
  const error = compareForecastError(topSeries, desk.calendar, 7);

  const slowRows = desk.items.map((i) => ({ stock: i.currentStock, price: i.price, slow: desk.results.get(i.id)?.decision.status === "Don't reorder" }));

  return {
    asOf,
    stockouts: { itemDays: thisWeek.itemDays, possibleItemDays: thisWeek.possibleItemDays, ratePct: thisWeek.ratePct, topItems: thisWeek.topItemIds.length, lastWeekItemDays: lastWeek.itemDays },
    error,
    slow: { value: slowStockValue(slowRows), items: slowRows.filter((r) => r.slow).length },
    prep: { averageSeconds: averagePrepSeconds(orders.map((o) => o.prepSeconds)), orders: orders.filter((o) => o.prepSeconds !== null).length },
  };
}
