// Weekly scorecard maths (BRD FR10). Pure functions, no database, so every number can be checked by hand.
// 1. Out-of-stock item-days on the top 20 items.
// 2. Forecast error of the blend against the plain 28-day average (model M2).
// 3. Rupee value of slow stock.
import { addDays, blend, MODEL_IDS, predict, scoreModel, SETTINGS, type CalendarDay, type SalesSeries } from "@/lib/forecast/desk";

export interface DatedQty { date: string; itemId: string; qty: number }

// ---------- 1. Out-of-stock item-days ----------
// The app stores only today's stock, so past closing stock is worked out backwards:
//   closing stock on day D = stock now + sales after D - deliveries after D.
// A day counts as "out of stock" when the closing stock is 0 or less. This is an estimate:
// sales are never recorded below zero stock, so real stock-outs can be a little under-counted.

export function closingStock(currentStock: number, day: string, sales: DatedQty[], deliveries: DatedQty[]): number {
  const soldAfter = sales.filter((s) => s.date > day).reduce((a, s) => a + s.qty, 0);
  const receivedAfter = deliveries.filter((d) => d.date > day).reduce((a, d) => a + d.qty, 0);
  return currentStock + soldAfter - receivedAfter;
}

export interface StockoutInput {
  items: { id: string; currentStock: number }[];
  sales: DatedQty[];
  deliveries: DatedQty[];
  asOf: string; // last complete day
  days?: number; // length of the week, default 7
  endOffsetDays?: number; // 0 = the week ending asOf; 7 = the week before
  topN?: number; // default 20
  rankDays?: number; // top items are ranked by units sold in this many days, default 28
}
export interface StockoutResult {
  itemDays: number; // item-days with no stock
  possibleItemDays: number; // top items x days
  ratePct: number; // itemDays / possibleItemDays x 100
  topItemIds: string[];
  byItem: { itemId: string; days: number }[];
}

export function outOfStockItemDays(input: StockoutInput): StockoutResult {
  const days = input.days ?? 7;
  const topN = input.topN ?? 20;
  const rankDays = input.rankDays ?? 28;
  const end = addDays(input.asOf, -(input.endOffsetDays ?? 0));
  const rankFrom = addDays(input.asOf, -(rankDays - 1));

  const sold = new Map<string, number>();
  for (const s of input.sales) if (s.date >= rankFrom && s.date <= input.asOf) sold.set(s.itemId, (sold.get(s.itemId) ?? 0) + s.qty);
  const top = input.items
    .filter((i) => (sold.get(i.id) ?? 0) > 0)
    .sort((a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0) || a.id.localeCompare(b.id))
    .slice(0, topN);

  const byItem = top.map((it) => {
    const sales = input.sales.filter((s) => s.itemId === it.id);
    const deliveries = input.deliveries.filter((d) => d.itemId === it.id);
    let out = 0;
    for (let k = 0; k < days; k++) if (closingStock(it.currentStock, addDays(end, -k), sales, deliveries) <= 0) out++;
    return { itemId: it.id, days: out };
  });
  const itemDays = byItem.reduce((a, b) => a + b.days, 0);
  const possible = top.length * days;
  return { itemDays, possibleItemDays: possible, ratePct: possible ? (itemDays / possible) * 100 : 0, topItemIds: top.map((t) => t.id), byItem };
}

// ---------- 2. Forecast error: blend against the plain 28-day average ----------
// Walk-forward test. For each of the last `testDays` days we pretend it is that morning:
// only earlier days are used to score the five models, set the weights and make the blend.
// The blend is then compared with the plain 28-day average (M2) and with what really sold.
// Because no weight sees the day it is tested on, the result is fair to the plain average.

export interface ItemError { blend: number; simple: number; days: number }

export function walkForwardError(series: SalesSeries, calendarDays: CalendarDay[], testDays = 7): ItemError | null {
  const cal = new Map(calendarDays.map((c) => [c.date, c]));
  const n = series.qty.length;
  let blendSum = 0, simpleSum = 0, tested = 0;
  for (let t = Math.max(SETTINGS.minHistoryDays, n - testDays); t < n; t++) {
    const past: SalesSeries = { dates: series.dates.slice(0, t), qty: series.qty.slice(0, t) };
    const simple = predict("M2", past, t, cal);
    const recent = past.qty.slice(-28);
    const avg28 = recent.reduce((a, b) => a + b, 0) / recent.length;
    let blended = simple;
    if (avg28 >= SETTINGS.slowSellerPerDay) {
      const members = MODEL_IDS.map((m) => ({ model: m, forecast: predict(m, past, t, cal), mae: scoreModel(m, past, cal) }));
      blended = blend(members).forecast;
    }
    blendSum += Math.abs(blended - series.qty[t]);
    simpleSum += Math.abs(simple - series.qty[t]);
    tested++;
  }
  return tested ? { blend: blendSum / tested, simple: simpleSum / tested, days: tested } : null;
}

export interface ErrorComparison {
  items: number; // items that could be tested
  blendError: number; // average units missed per item per day, blend
  simpleError: number; // same, plain 28-day average
  improvementPct: number | null; // how much lower the blend error is; null when the plain average had no error
}

export function improvementPct(blendError: number, simpleError: number): number | null {
  return simpleError > 0 ? (1 - blendError / simpleError) * 100 : null;
}

export function compareForecastError(seriesList: SalesSeries[], calendarDays: CalendarDay[], testDays = 7): ErrorComparison {
  const results = seriesList.map((s) => walkForwardError(s, calendarDays, testDays)).filter((r): r is ItemError => r !== null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const blendError = avg(results.map((r) => r.blend));
  const simpleError = avg(results.map((r) => r.simple));
  return { items: results.length, blendError, simpleError, improvementPct: results.length ? improvementPct(blendError, simpleError) : null };
}

// The same comparison, from the forecasts the nightly job really saved (the honest version).
// Each saved forecast says "this item will sell X a day over the next H days". Once those H days have passed we know
// what really sold, so we can measure how far off the blend and the plain 28-day average (M2) were on that night.
export interface SavedForecastRow { runDate: string; itemId: string; horizonDays: number; blendUnitsPerDay: number; simpleUnitsPerDay: number | null }
export interface SavedEvaluation {
  forecasts: number; // saved forecasts that could be checked
  nights: number; // different nights they were made on
  items: number; // different items
  blendError: number; // average units per day missed by the blend
  simpleError: number; // same, for the plain 28-day average
  improvementPct: number | null;
}

export function evaluateSavedForecasts(rows: SavedForecastRow[], sales: DatedQty[], asOf: string, opts: { fromRunDate?: string; itemIds?: Set<string> } = {}): SavedEvaluation {
  const byItemDay = new Map<string, number>();
  for (const s of sales) byItemDay.set(`${s.itemId}|${s.date}`, (byItemDay.get(`${s.itemId}|${s.date}`) ?? 0) + s.qty);
  let n = 0, blendSum = 0, simpleSum = 0;
  const nights = new Set<string>();
  const items = new Set<string>();
  for (const r of rows) {
    if (r.simpleUnitsPerDay === null || r.horizonDays < 1) continue;
    if (opts.fromRunDate && r.runDate < opts.fromRunDate) continue;
    if (opts.itemIds && !opts.itemIds.has(r.itemId)) continue;
    if (addDays(r.runDate, r.horizonDays) > asOf) continue; // not every day it covered has passed yet
    let total = 0;
    for (let k = 1; k <= r.horizonDays; k++) total += byItemDay.get(`${r.itemId}|${addDays(r.runDate, k)}`) ?? 0;
    const actual = total / r.horizonDays;
    blendSum += Math.abs(r.blendUnitsPerDay - actual);
    simpleSum += Math.abs(r.simpleUnitsPerDay - actual);
    nights.add(r.runDate); items.add(r.itemId); n++;
  }
  const blendError = n ? blendSum / n : 0;
  const simpleError = n ? simpleSum / n : 0;
  return { forecasts: n, nights: nights.size, items: items.size, blendError, simpleError, improvementPct: n ? improvementPct(blendError, simpleError) : null };
}

/** Saved forecasts are used for the scorecard once there are enough of them. Before that, the back-test is shown. */
export const SAVED_MIN = { forecasts: 40, nights: 3 };

// ---------- 3. Rupee value of slow stock ----------
// Slow stock = items on the "Don't reorder" list (BR4). Valued at the selling price, because the app
// does not hold a cost price yet.
export function slowStockValue(rows: { stock: number; price: number; slow: boolean }[]): number {
  return Math.round(rows.filter((r) => r.slow).reduce((a, r) => a + r.stock * r.price, 0));
}
