// Runs the AI provider over every item and keeps the answers next to the Forecast Desk's own forecast.
// Nothing here changes an order. SERVER ONLY.
import { addDays } from "@/lib/forecast/desk";
import { asOfDay } from "@/lib/dates";
import { buildSeries, computeShopDesk } from "@/lib/desk-service";
import type { AiForecastRow, Store } from "@/lib/data/types";
import { buildAiRequest } from "./payload";
import { getAiMode, getForecaster } from "./registry";

export interface ShadowRunSummary { provider: string; runDate: string; saved: number; failed: number; firstError: string | null }

export async function runShadow(store: Store): Promise<ShadowRunSummary> {
  const forecaster = getForecaster();
  if (!forecaster || getAiMode() === "off") throw new Error("AI forecasts are switched off.");

  const desk = await computeShopDesk(store, { useAi: false }); // the pure Forecast Desk answer, for a fair comparison
  const runDate = asOfDay();
  const rows: AiForecastRow[] = [];
  let failed = 0;
  let firstError: string | null = null;

  const work = desk.items.map((item) => async () => {
    const result = desk.results.get(item.id)!;
    const horizonDays = item.leadTimeDays + item.orderCoverDays;
    const request = buildAiRequest({
      item,
      input: { itemId: item.id, leadTimeDays: item.leadTimeDays, minSafetyStock: item.minSafetyStock, orderCoverDays: item.orderCoverDays, currentStock: item.currentStock, onOrder: desk.onOrder[item.id] ?? 0 },
      result, series: buildSeries(item.id, desk.sales, desk.asOf), calendar: desk.calendar, asOf: desk.asOf, horizonDays,
    });
    try {
      const ai = await forecaster.forecast(request);
      rows.push({ runDate, itemId: item.id, provider: forecaster.id, aiUnitsPerDay: ai.unitsPerDay, blendUnitsPerDay: result.forecast, horizonDays, low: ai.low ?? null, high: ai.high ?? null });
    } catch (e) {
      failed++;
      firstError ??= (e as Error).message;
    }
  });
  // Four at a time, so a slow AI service is not flooded.
  for (let i = 0; i < work.length; i += 4) await Promise.all(work.slice(i, i + 4).map((w) => w()));

  await store.saveAiForecasts(rows);
  return { provider: forecaster.id, runDate: addDays(runDate, 0), saved: rows.length, failed, firstError };
}
