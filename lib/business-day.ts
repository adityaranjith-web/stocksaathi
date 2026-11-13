// The shop's business date, and sample sales for the demo shop. Pure code, no database (tests are in business-day.test.ts).
//
// Business date: each shop has one "today", stored in the database and the same for every person. It follows the real
// date unless the product team has closed days ahead of it (shops.business_date, migration 0008). The Forecast Desk uses
// complete days only, so the day it works up to ("as of") is the business date minus one.
//
// Sample sales: only the demo shop (shops.is_sample_shop) ever gets them. They follow the pattern already in the shop's
// own history: each item's usual size and how often it sells (so the slow items stay slow), and the weekday effect.
import { addDays } from "@/lib/forecast/desk";
import type { Sale } from "@/lib/data/types";

/** A day with fewer sales than this (in the demo shop) may be filled with sample sales. */
export const SAMPLE_MIN_SALES = 5;
/** The nightly job keeps the demo shop's days filled up to this date. After it, nothing is added. */
export const SAMPLE_FILL_UNTIL = "2026-11-27";
/** The business date may be at most this many days ahead of the real date. */
export const MAX_DAYS_AHEAD = 60;
/** How many past days the sample pattern is learned from. */
const PATTERN_DAYS = 28;

/** The business date never falls behind the real date: a stored date in the past counts as "follow the real date". */
export function effectiveBusinessDate(stored: string | null | undefined, real: string): string {
  return stored && stored > real ? stored : real;
}

/** The last complete day: what the Forecast Desk works up to. */
export const asOfFor = (businessDate: string) => addDays(businessDate, -1);

// ---------- a small seeded random generator, so the same day always gets the same sample sales ----------
function hashString(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return (Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const weekday = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();

export interface SampleRow { itemId: string; qty: number }

/**
 * Sample sales for one day, from the shop's own history before that day.
 * - how often an item sells = the share of days (that had any sales) on which it sold. A fast item sells every day;
 *   a slow item sells now and then, and stays slow.
 * - how much on a day it sells = its usual quantity on selling days, times the weekday effect, with some ups and downs.
 * - the weekday effect = how each weekday compares with the average day, learned from the last 28 days.
 * The same day and the same history always give the same answer.
 */
export function sampleSalesForDay(day: string, itemIds: string[], history: Pick<Sale, "date" | "itemId" | "qty">[]): SampleRow[] {
  const from = addDays(day, -PATTERN_DAYS);
  const recent = history.filter((s) => s.date >= from && s.date < day);

  const dayTotal = new Map<string, number>();
  for (const s of recent) dayTotal.set(s.date, (dayTotal.get(s.date) ?? 0) + s.qty);
  if (dayTotal.size === 0) return []; // nothing to learn from

  const overall = [...dayTotal.values()].reduce((a, b) => a + b, 0) / dayTotal.size;
  const byWeekday = new Map<number, number[]>();
  for (const [d, t] of dayTotal) byWeekday.set(weekday(d), [...(byWeekday.get(weekday(d)) ?? []), t]);
  const raw = byWeekday.get(weekday(day));
  const rawFactor = raw && overall > 0 ? raw.reduce((a, b) => a + b, 0) / raw.length / overall : 1;
  const factor = 1 + 0.8 * (Math.min(1.6, Math.max(0.6, rawFactor)) - 1); // a little shrunk towards 1

  const perItem = new Map<string, Map<string, number>>();
  for (const s of recent) {
    const m = perItem.get(s.itemId) ?? new Map<string, number>();
    m.set(s.date, (m.get(s.date) ?? 0) + s.qty);
    perItem.set(s.itemId, m);
  }

  const rows: SampleRow[] = [];
  for (const itemId of itemIds) {
    const days = perItem.get(itemId);
    if (!days || days.size === 0) continue; // an item with no history gets no sample sales
    const quantities = [...days.values()];
    const sellingDays = quantities.length;
    const usual = quantities.reduce((a, b) => a + b, 0) / sellingDays;
    const biggest = Math.max(...quantities);
    const chance = Math.min(1, sellingDays / dayTotal.size);
    const rng = mulberry32(hashString(`${itemId}|${day}`));
    if (chance < 0.999 && rng() >= chance) continue; // a slow item does not sell today
    const noise = 1 + 0.6 * (rng() + rng() - 1); // about 0.4 to 1.6 times, mostly near 1
    const qty = Math.min(Math.ceil(biggest * 1.5), Math.max(1, Math.round(usual * factor * noise)));
    rows.push({ itemId, qty });
  }
  return rows;
}

/** Days up to asOf that have fewer than minSales sales, counting from the first day that has any sale. */
export function gapDays(sales: Pick<Sale, "date">[], asOf: string, minSales = SAMPLE_MIN_SALES): string[] {
  if (sales.length === 0) return [];
  const count = new Map<string, number>();
  let first = sales[0].date;
  for (const s of sales) { count.set(s.date, (count.get(s.date) ?? 0) + 1); if (s.date < first) first = s.date; }
  const gaps: string[] = [];
  for (let d = first; d <= asOf; d = addDays(d, 1)) if ((count.get(d) ?? 0) < minSales) gaps.push(d);
  return gaps;
}

/**
 * The sample sales that fill every thin day up to asOf (never after fillUntil). Days are filled oldest first, so a later
 * day learns from the earlier ones. Returns only the new rows.
 */
export function fillGaps(args: { sales: Pick<Sale, "date" | "itemId" | "qty">[]; itemIds: string[]; asOf: string; fillUntil?: string }): { date: string; itemId: string; qty: number }[] {
  const until = args.fillUntil ?? SAMPLE_FILL_UNTIL;
  const all = [...args.sales];
  const added: { date: string; itemId: string; qty: number }[] = [];
  for (const d of gapDays(all, args.asOf)) {
    if (d > until) break;
    // a thin day that already has a few sales is topped up, never replaced
    const fresh = sampleSalesForDay(d, args.itemIds, all).filter((r) => !all.some((s) => s.date === d && s.itemId === r.itemId));
    for (const r of fresh) {
      added.push({ date: d, ...r });
      all.push({ date: d, itemId: r.itemId, qty: r.qty });
    }
  }
  return added;
}

/** Who sees "Close the day" and "Back to real date" on Home: the owner on the product team (the database checks it again). */
export function canCloseDay(me: { role: string; isTeam: boolean }): boolean {
  return me.role === "owner" && me.isTeam === true;
}
