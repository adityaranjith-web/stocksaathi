// Checking an AI model against real sales, and the rules for letting it into orders. Pure functions.
import { addDays, SETTINGS } from "@/lib/forecast/desk";
import type { AiForecastRow } from "@/lib/data/types";

export interface ShadowEvaluation {
  rows: number; // forecasts whose whole horizon has passed, so they can be checked
  runDays: number; // different days those forecasts were made on
  aiError: number; // average units per day missed by the AI
  blendError: number; // same, for the Forecast Desk blend made on the same day
  improvementPct: number | null; // how much lower the AI error is than the blend error
}

export function evaluateShadow(rows: AiForecastRow[], sales: { date: string; itemId: string; qty: number }[], asOf: string): ShadowEvaluation {
  const byItemDay = new Map<string, number>();
  for (const s of sales) byItemDay.set(`${s.itemId}|${s.date}`, (byItemDay.get(`${s.itemId}|${s.date}`) ?? 0) + s.qty);
  let n = 0, aiSum = 0, blendSum = 0;
  const days = new Set<string>();
  for (const r of rows) {
    if (addDays(r.runDate, r.horizonDays) > asOf) continue; // not all days have passed yet
    let total = 0;
    for (let k = 1; k <= r.horizonDays; k++) total += byItemDay.get(`${r.itemId}|${addDays(r.runDate, k)}`) ?? 0;
    const actual = total / r.horizonDays;
    aiSum += Math.abs(r.aiUnitsPerDay - actual);
    blendSum += Math.abs(r.blendUnitsPerDay - actual);
    days.add(r.runDate);
    n++;
  }
  const aiError = n ? aiSum / n : 0;
  const blendError = n ? blendSum / n : 0;
  return { rows: n, runDays: days.size, aiError, blendError, improvementPct: n && blendError > 0 ? (1 - aiError / blendError) * 100 : null };
}

export const PROMOTION_RULES = { minRows: 50, minRunDays: 14, minGainPct: 10 };

/** An AI model may be mixed into orders only when it has beaten the Forecast Desk by enough, over enough days. */
export function shouldPromote(ev: ShadowEvaluation, rules = PROMOTION_RULES): { promote: boolean; reason: string } {
  if (ev.runDays < rules.minRunDays) return { promote: false, reason: `Needs forecasts from ${rules.minRunDays} different days. So far: ${ev.runDays}.` };
  if (ev.rows < rules.minRows) return { promote: false, reason: `Needs ${rules.minRows} checked forecasts. So far: ${ev.rows}.` };
  if (ev.improvementPct === null || ev.improvementPct < rules.minGainPct) {
    return { promote: false, reason: `Needs to miss at least ${rules.minGainPct}% fewer units than the Forecast Desk. So far: ${ev.improvementPct === null ? "no gain" : ev.improvementPct.toFixed(1) + "%"}.` };
  }
  return { promote: true, reason: `Missed ${ev.improvementPct.toFixed(1)}% fewer units than the Forecast Desk over ${ev.rows} forecasts.` };
}

export const MAX_AI_WEIGHT = 0.4;
export const DEFAULT_AI_WEIGHT = 0.3;

/** Mixes the AI forecast into the blend. The AI never gets more than 40%, and the BR6 guard rail still applies. */
export function blendWithAi(blendUnits: number, aiUnits: number, avg28: number, opts: { aiWeight?: number; festivalAhead?: boolean } = {}) {
  const w = Math.min(MAX_AI_WEIGHT, Math.max(0, opts.aiWeight ?? DEFAULT_AI_WEIGHT));
  let units = (1 - w) * blendUnits + w * aiUnits;
  let capped = false;
  if (!opts.festivalAhead && avg28 > 0 && units > SETTINGS.guardRailMultiple * avg28) { units = SETTINGS.guardRailMultiple * avg28; capped = true; }
  return { unitsPerDay: units, aiWeight: w, capped };
}
