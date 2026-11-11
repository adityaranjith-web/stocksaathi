// Builds each item's daily sales series and runs the Forecast Desk for the whole shop.
import { addDays, runDesk, type DeskResult, type SalesSeries } from "@/lib/forecast/desk";
import { asOfDay } from "@/lib/dates";
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

export interface ShopDesk {
  asOf: string;
  items: Item[];
  distributors: Distributor[];
  results: Map<string, DeskResult>;
  onOrder: Record<string, number>;
  todaySales: { units: number; value: number };
  sales: Sale[]; // the last 56 days of sales, kept so other screens do not have to fetch them again
  calendar: { date: string; name: string; upliftPct: number }[];
}

/**
 * useAi=false gives the pure Forecast Desk answer. The AI step only runs when AI_MODE is "blend",
 * a provider is set up, and the AI has passed the checks in shouldPromote (see docs/ai-integration.md).
 */
export async function computeShopDesk(store: Store, opts: { useAi?: boolean } = {}): Promise<ShopDesk> {
  const asOf = asOfDay();
  const [items, distributors, sales, calendar, onOrder] = await Promise.all([
    store.listItems(), store.listDistributors(), store.listSales(addDays(asOf, -(LOOKBACK_DAYS - 1))), store.listCalendar(), store.openOrderQty(),
  ]);
  const results = new Map<string, DeskResult>();
  const inputs = new Map<string, Parameters<typeof runDesk>[0]>();
  for (const it of items) {
    const input = { itemId: it.id, leadTimeDays: it.leadTimeDays, minSafetyStock: it.minSafetyStock, orderCoverDays: it.orderCoverDays, currentStock: it.currentStock, onOrder: onOrder[it.id] ?? 0 };
    inputs.set(it.id, input);
    results.set(it.id, runDesk(input, buildSeries(it.id, sales, asOf), calendar));
  }

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
  const todays = sales.filter((s) => s.date > asOf);
  return {
    asOf, items, distributors, results, onOrder, sales, calendar,
    todaySales: { units: todays.reduce((a, s) => a + s.qty, 0), value: todays.reduce((a, s) => a + s.qty * (price.get(s.itemId) ?? 0), 0) },
  };
}
