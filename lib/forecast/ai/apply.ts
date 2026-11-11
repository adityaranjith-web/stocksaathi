// Mixes a proven AI forecast into one item's Forecast Desk result, without touching the Desk itself.
import { decide, type DeskResult, type ItemInput } from "@/lib/forecast/desk";
import type { AiForecastRow } from "@/lib/data/types";
import { blendWithAi, DEFAULT_AI_WEIGHT } from "./evaluate";

export function applyAiBlend(result: DeskResult, item: ItemInput, row: AiForecastRow | undefined, festivalAhead: boolean, weight = DEFAULT_AI_WEIGHT): DeskResult {
  if (!row) return result;
  const mixed = blendWithAi(result.forecast, row.aiUnitsPerDay, result.avg28, { aiWeight: weight, festivalAhead });
  const decision = decide(item, mixed.unitsPerDay, result.spread, result.soldLast14);
  const notes = [...result.notes, `AI second opinion mixed in at ${Math.round(mixed.aiWeight * 100)}%${mixed.capped ? " (capped at double the 28-day average)" : ""}`];
  return { ...result, forecast: mixed.unitsPerDay, decision, notes };
}
