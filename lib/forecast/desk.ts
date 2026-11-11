// Forecast Desk: five simple models, checked against recent sales and blended by accuracy.
// Rules BR1 to BR6 in the BRD. Pure functions only, so every number can be checked by hand.

export type ModelId = "M1" | "M2" | "M3" | "M4" | "M5";
export const MODEL_IDS: ModelId[] = ["M1", "M2", "M3", "M4", "M5"];
export const MODEL_NAMES: Record<ModelId, string> = {
  M1: "Last week (7-day average)",
  M2: "Steady (28-day average)",
  M3: "Weekday pattern (same day, last 4 weeks)",
  M4: "Trend (recent days count more)",
  M5: "Look-alike days (same conditions)",
};

export const SETTINGS = {
  scoreDays: 14, // BR5: models are scored on the last 14 days
  minHistoryDays: 14, // BR5: new items need 14 days of history
  slowSellerPerDay: 1, // BR5: under 1 sale a day uses only M2
  minWeight: 0.05,
  maxWeight: 0.6,
  festivalMinWeight: 0.3, // festival ahead: M5 gets at least 30%
  noSaleDays: 14, // BR4
  overstockCoverDays: 30, // BR4
  safetyCapDays: 7, // BR3
  guardRailMultiple: 2, // BR6
  smoothingAlpha: 0.3, // M4
};

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  name: string;
  upliftPct: number; // team estimate, e.g. 40 means +40%
}

export interface ItemInput {
  itemId: string;
  leadTimeDays: number;
  minSafetyStock: number;
  orderCoverDays: number;
  currentStock: number;
  onOrder: number;
}

/** Daily sales for one item, oldest first. dates[i] is the day of qty[i]. The last entry is "today" (as-of day). */
export interface SalesSeries {
  dates: string[];
  qty: number[];
}

// ---------- date helpers (UTC, YYYY-MM-DD) ----------
export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekday(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay();
}
function dayOfMonth(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDate();
}

export type DayTag = "festival" | "salary week" | "weekend" | "normal";
export function tagOf(date: string, calendar: Map<string, CalendarDay>): DayTag {
  if (calendar.has(date)) return "festival";
  if (dayOfMonth(date) <= 7) return "salary week";
  const w = weekday(date);
  if (w === 0 || w === 6) return "weekend";
  return "normal";
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// ---------- the five models ----------
// Each model forecasts sales on day index t using only known days before t (and before the end of the series).
function known(series: SalesSeries, t: number) {
  return Math.min(t, series.qty.length);
}

function m1(s: SalesSeries, t: number) {
  const k = known(s, t);
  return mean(s.qty.slice(Math.max(0, k - 7), k));
}
function m2(s: SalesSeries, t: number) {
  const k = known(s, t);
  return mean(s.qty.slice(Math.max(0, k - 28), k));
}
function m3(s: SalesSeries, t: number) {
  const k = known(s, t);
  const vals: number[] = [];
  for (let j = t - 7; j >= 0 && vals.length < 4; j -= 7) if (j < k) vals.push(s.qty[j]);
  return vals.length ? mean(vals) : m2(s, t);
}
function m4(s: SalesSeries, t: number) {
  const k = known(s, t);
  const xs = s.qty.slice(Math.max(0, k - 28), k);
  if (!xs.length) return 0;
  let level = xs[0];
  for (const x of xs.slice(1)) level = SETTINGS.smoothingAlpha * x + (1 - SETTINGS.smoothingAlpha) * level;
  return level;
}
function m5(s: SalesSeries, t: number, cal: Map<string, CalendarDay>) {
  const target = dateAt(s, t);
  const fest = cal.get(target);
  // Festival day: steady average plus the team's uplift estimate for that festival.
  if (fest) return m2(s, t) * (1 + fest.upliftPct / 100);
  const tag = tagOf(target, cal);
  const k = known(s, t);
  const vals: number[] = [];
  for (let j = k - 1; j >= Math.max(0, k - 56); j--) if (tagOf(s.dates[j], cal) === tag) vals.push(s.qty[j]);
  return vals.length >= 2 ? mean(vals) : m2(s, t);
}

function dateAt(s: SalesSeries, t: number) {
  if (t < s.dates.length) return s.dates[t];
  return addDays(s.dates[s.dates.length - 1], t - s.dates.length + 1);
}

export function predict(model: ModelId, s: SalesSeries, t: number, cal: Map<string, CalendarDay>): number {
  switch (model) {
    case "M1": return m1(s, t);
    case "M2": return m2(s, t);
    case "M3": return m3(s, t);
    case "M4": return m4(s, t);
    case "M5": return m5(s, t, cal);
  }
}

// ---------- step 3: check first (score each model on recent real sales) ----------
export function scoreModel(model: ModelId, s: SalesSeries, cal: Map<string, CalendarDay>): number {
  const n = s.qty.length;
  const start = Math.max(1, n - SETTINGS.scoreDays);
  const misses: number[] = [];
  for (let t = start; t < n; t++) misses.push(Math.abs(predict(model, s, t, cal) - s.qty[t]));
  return mean(misses);
}

// ---------- step 4: blend ----------
export interface MemberResult {
  model: ModelId;
  forecast: number; // units per day over the order horizon
  mae: number; // average miss over the last 14 days
  weight: number;
}

/** Keeps every weight between min and max (BR5), and applies any floors, then re-scales to 100%. */
export function boundWeights(raw: number[], min: number, max: number, floors: number[] = []): number[] {
  const lo = raw.map((_, i) => Math.max(min, floors[i] ?? 0));
  const locked: (number | null)[] = raw.map(() => null);
  let w = raw.slice();
  for (let iter = 0; iter <= raw.length; iter++) {
    const remaining = 1 - locked.reduce<number>((a, x) => a + (x ?? 0), 0);
    const freeRaw = raw.reduce((a, x, i) => a + (locked[i] === null ? x : 0), 0);
    w = raw.map((x, i) => locked[i] ?? (freeRaw > 0 ? (x / freeRaw) * remaining : 0));
    // Lock models above the cap first; only then lift models below their floor.
    const over = w.map((x, i) => locked[i] === null && x > max + 1e-12);
    const under = w.map((x, i) => locked[i] === null && x < lo[i] - 1e-12);
    if (over.some(Boolean)) over.forEach((o, i) => { if (o) locked[i] = max; });
    else if (under.some(Boolean)) under.forEach((u, i) => { if (u) locked[i] = lo[i]; });
    else break;
  }
  // Final fix-up: if bounds left the total off 100%, move the gap only to weights that still have room.
  for (let iter = 0; iter < 10; iter++) {
    w = w.map((x, i) => Math.min(max, Math.max(lo[i], x)));
    const gap = w.reduce((a, b) => a + b, 0) - 1;
    if (Math.abs(gap) < 1e-12) break;
    const room = w.map((x, i) => (gap > 0 ? x - lo[i] : max - x));
    const totalRoom = room.reduce((a, b) => a + b, 0);
    if (totalRoom <= 0) break;
    w = w.map((x, i) => x - (gap * room[i]) / totalRoom);
  }
  return w;
}

export function blend(members: { model: ModelId; forecast: number; mae: number }[], floors: Partial<Record<ModelId, number>> = {}) {
  if (members.length === 1) {
    return { members: [{ ...members[0], weight: 1 }], forecast: members[0].forecast, spread: 0 };
  }
  const inv = members.map((m) => 1 / Math.max(m.mae, 0.05));
  const weights = boundWeights(inv, SETTINGS.minWeight, SETTINGS.maxWeight, members.map((m) => floors[m.model] ?? 0));
  const out = members.map((m, i) => ({ ...m, weight: weights[i] }));
  const forecast = out.reduce((a, m) => a + m.weight * m.forecast, 0);
  const fs = members.map((m) => m.forecast);
  return { members: out, forecast, spread: Math.max(...fs) - Math.min(...fs) };
}

export type Confidence = "High" | "Medium" | "Low";
export function confidenceOf(forecast: number, spread: number): Confidence {
  if (forecast <= 0) return "Low";
  const r = spread / forecast;
  return r <= 0.2 ? "High" : r <= 0.5 ? "Medium" : "Low";
}

// ---------- step 5: decide (BR1 to BR4) ----------
export type Status = "Reorder today" | "Don't reorder" | "OK";
export interface Decision {
  status: Status;
  reason: string;
  safetyStock: number;
  reorderPoint: number;
  orderQty: number;
  coverDays: number;
}

export function decide(item: ItemInput, forecast: number, spread: number, soldLast14: number): Decision {
  const ssFromSpread = Math.min(spread * item.leadTimeDays, SETTINGS.safetyCapDays * forecast);
  const safetyStock = Math.max(item.minSafetyStock, ssFromSpread);
  const reorderPoint = forecast * item.leadTimeDays + safetyStock;
  const coverDays = forecast > 0 ? item.currentStock / forecast : Infinity;
  const base = { safetyStock, reorderPoint, coverDays, orderQty: 0 };
  if (soldLast14 === 0) return { ...base, status: "Don't reorder", reason: `No sale in the last ${SETTINGS.noSaleDays} days` };
  if (coverDays > SETTINGS.overstockCoverDays)
    return { ...base, status: "Don't reorder", reason: `More than ${SETTINGS.overstockCoverDays} days of stock in hand` };
  const position = item.currentStock + item.onOrder;
  if (position <= reorderPoint) {
    const raw = forecast * (item.leadTimeDays + item.orderCoverDays) + safetyStock - position;
    return { ...base, status: "Reorder today", reason: "Stock at or below reorder point", orderQty: Math.max(1, Math.ceil(raw - 1e-9)) };
  }
  return { ...base, status: "OK", reason: "Enough stock" };
}

// ---------- the whole desk for one item ----------
export interface DeskResult {
  itemId: string;
  forecast: number;
  spread: number;
  confidence: Confidence;
  members: MemberResult[];
  notes: string[];
  avg28: number;
  soldLast14: number;
  guardRail: boolean;
  decision: Decision;
}

export function runDesk(item: ItemInput, s: SalesSeries, calendarDays: CalendarDay[]): DeskResult {
  const cal = new Map(calendarDays.map((c) => [c.date, c]));
  const n = s.qty.length;
  const horizon = item.leadTimeDays + item.orderCoverDays;
  const avg28 = m2(s, n);
  const soldLast14 = s.qty.slice(Math.max(0, n - 14)).reduce((a, b) => a + b, 0);
  const notes: string[] = [];

  const horizonForecast = (m: ModelId) => {
    let total = 0;
    for (let t = n; t < n + horizon; t++) total += predict(m, s, t, cal);
    return total / horizon;
  };
  const festivalsAhead = Array.from({ length: horizon }, (_, i) => cal.get(addDays(s.dates[n - 1], i + 1))).filter(Boolean) as CalendarDay[];

  // Condition gate (BR5)
  let active: ModelId[] = MODEL_IDS;
  let forcedLow = false;
  if (n < SETTINGS.minHistoryDays) {
    active = ["M2"]; forcedLow = true; notes.push(`New item: under ${SETTINGS.minHistoryDays} days of sales, so only the steady average is used`);
  } else if (avg28 < SETTINGS.slowSellerPerDay) {
    active = ["M2"]; forcedLow = true; notes.push("Slow seller: under 1 sale a day, so only the steady average is used");
  }
  const floors: Partial<Record<ModelId, number>> = {};
  if (festivalsAhead.length && active.includes("M5")) {
    floors.M5 = SETTINGS.festivalMinWeight;
    notes.push(`${festivalsAhead.map((f) => f.name).join(", ")} ahead: look-alike model given at least 30%`);
  }

  const b = blend(active.map((m) => ({ model: m, forecast: horizonForecast(m), mae: scoreModel(m, s, cal) })), floors);
  let forecast = b.forecast;

  // Guard rail (BR6)
  let guardRail = false;
  if (avg28 > 0 && forecast > SETTINGS.guardRailMultiple * avg28 && !festivalsAhead.length) {
    forecast = SETTINGS.guardRailMultiple * avg28; guardRail = true;
    notes.push("Forecast was more than double the 28-day average with no event marked: capped, please check");
  }
  const confidence: Confidence = forcedLow ? "Low" : confidenceOf(forecast, b.spread);
  const decision = decide(item, forecast, b.spread, soldLast14);
  return { itemId: item.itemId, forecast, spread: b.spread, confidence, members: b.members, notes, avg28, soldLast14, guardRail, decision };
}
