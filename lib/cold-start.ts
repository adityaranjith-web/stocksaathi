// Cold start: a new item has no sales to learn from, so the owner's own estimate ("about 8 a day") is used as the forecast,
// and the real sales are blended in as they arrive. Pure code, tested in cold-start.test.ts.
//
// The rule (the owner asked for it exactly like this):
//   - An item with an estimate and FEWER than 14 days of sales: forecast = w x (real average) + (1 - w) x (estimate),
//     where w = days of data / 14. With no sales yet, w = 0 and the forecast is the estimate. With 7 days, it is half and half.
//   - An item with 14 or more days of sales, or with no estimate: nothing changes. The Forecast Desk works as always.
// The Forecast Desk (lib/forecast/desk.ts) is not changed. Only its result for such an item is replaced, and the order is
// worked out by the Desk's own rule (decide), so BR1 to BR4 still apply.
import { decide, type DeskResult, type ItemInput, type SalesSeries } from "@/lib/forecast/desk";
import { COLD_START_LABEL } from "./cold-start-label";

/** An item stops being "cold" (and the estimate stops counting) after this many days of sales. */
export const COLD_START_DAYS = 14;
/** Shown on the reorder list and on Why this number. */
export { COLD_START_LABEL } from "./cold-start-label";

export interface ColdStartInfo {
  estimate: number; // the owner's units per day
  daysOfData: number; // days since the item's first sale (0 when it has not sold yet)
  realUnits: number; // units sold in those days
  realAvg: number; // units per day in those days
  weightReal: number; // days of data / 14
  forecast: number; // the blend, in units per day
}

/** Days of sales history of one item: from its first sale to the last complete day. 0 when it has never sold. */
export function daysOfSales(series: SalesSeries): number {
  return series.qty.some((q) => q > 0) ? series.dates.length : 0;
}

/** The blend. Weight on the real sales = days of data / 14 (never more than 1). */
export function coldStartBlend(a: { estimate: number; realUnits: number; daysOfData: number }): ColdStartInfo {
  const days = Math.max(0, Math.min(COLD_START_DAYS, Math.floor(a.daysOfData)));
  const weightReal = days / COLD_START_DAYS;
  const realAvg = days > 0 ? a.realUnits / days : 0;
  return {
    estimate: a.estimate, daysOfData: days, realUnits: a.realUnits, realAvg, weightReal,
    forecast: weightReal * realAvg + (1 - weightReal) * a.estimate,
  };
}

/** True when the estimate is used: the item has an estimate and fewer than 14 days of sales. */
export function isColdStart(estimate: number | null | undefined, daysOfData: number): boolean {
  return typeof estimate === "number" && Number.isFinite(estimate) && estimate >= 0 && daysOfData < COLD_START_DAYS;
}

/**
 * The Desk's result for a new item, replaced by the blend. Returns null when the estimate is not used (no estimate, or 14 or more
 * days of sales): the caller then keeps the Forecast Desk's own result untouched.
 */
export function applyColdStart(base: DeskResult, input: ItemInput, series: SalesSeries, estimate: number | null | undefined): { result: DeskResult; info: ColdStartInfo } | null {
  const days = daysOfSales(series);
  if (!isColdStart(estimate, days)) return null;
  const realUnits = series.qty.reduce((a, b) => a + b, 0);
  const info = coldStartBlend({ estimate: estimate as number, realUnits, daysOfData: days });
  const sold14 = series.qty.slice(-14).reduce((a, b) => a + b, 0);
  // decide() says "Don't reorder, no sale in 14 days" when nothing sold. A new item with an estimate has not been "slow": it is new.
  const decision = decide(input, info.forecast, 0, info.forecast > 0 ? Math.max(sold14, 1) : sold14);
  const result: DeskResult = {
    ...base,
    forecast: info.forecast, spread: 0, confidence: "Low", // always Low: it is an estimate
    members: [], // the five models have nothing to say yet
    notes: [COLD_START_LABEL],
    avg28: info.forecast, soldLast14: sold14, guardRail: false, decision,
  };
  return { result, info };
}
