// Builds each item's daily sales series and runs the Forecast Desk for the whole shop.
import { addDays, runDesk, type DeskResult, type SalesSeries } from "@/lib/forecast/desk";
import { asOfDay } from "@/lib/dates";
import type { Distributor, Item, Store } from "@/lib/data/types";

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

export interface ShopDesk {
  asOf: string;
  items: Item[];
  distributors: Distributor[];
  results: Map<string, DeskResult>;
  onOrder: Record<string, number>;
  todaySales: { units: number; value: number };
}

export async function computeShopDesk(store: Store): Promise<ShopDesk> {
  const asOf = asOfDay();
  const [items, distributors, sales, calendar, onOrder] = await Promise.all([
    store.listItems(), store.listDistributors(), store.listSales(addDays(asOf, -(LOOKBACK_DAYS - 1))), store.listCalendar(), store.openOrderQty(),
  ]);
  const results = new Map<string, DeskResult>();
  for (const it of items) {
    results.set(it.id, runDesk(
      { itemId: it.id, leadTimeDays: it.leadTimeDays, minSafetyStock: it.minSafetyStock, orderCoverDays: it.orderCoverDays, currentStock: it.currentStock, onOrder: onOrder[it.id] ?? 0 },
      buildSeries(it.id, sales, asOf),
      calendar,
    ));
  }
  const price = new Map(items.map((i) => [i.id, i.price]));
  const today = sales.filter((s) => s.date > asOf);
  return {
    asOf, items, distributors, results, onOrder,
    todaySales: { units: today.reduce((a, s) => a + s.qty, 0), value: today.reduce((a, s) => a + s.qty * (price.get(s.itemId) ?? 0), 0) },
  };
}
