// Builds the request sent to an AI model. Only item facts and daily unit sales go out.
// No shop name, locality, owner, helper, distributor, salesman or phone number (BRD section 7: privacy).
import { MODEL_IDS, type CalendarDay, type DeskResult, type ItemInput, type SalesSeries } from "@/lib/forecast/desk";
import type { Item } from "@/lib/data/types";
import type { AiForecastRequest } from "./types";

export function buildAiRequest(args: {
  item: Item; input: ItemInput; result: DeskResult; series: SalesSeries; calendar: CalendarDay[]; asOf: string; horizonDays: number;
}): AiForecastRequest {
  const { item, input, result, series, calendar, asOf, horizonDays } = args;
  const modelUnitsPerDay: Record<string, number> = {};
  for (const m of result.members) modelUnitsPerDay[m.model] = round3(m.forecast);
  for (const id of MODEL_IDS) if (!(id in modelUnitsPerDay)) modelUnitsPerDay[id] = round3(result.avg28); // gated models fall back to M2
  return {
    asOf,
    horizonDays,
    item: {
      id: item.id, name: item.name, category: item.category, pack: item.pack, price: item.price,
      leadTimeDays: input.leadTimeDays, orderCoverDays: input.orderCoverDays, currentStock: input.currentStock, onOrder: input.onOrder,
    },
    salesDaily: series.dates.map((date, i) => ({ date, qty: series.qty[i] })),
    calendar: calendar.map((c) => ({ date: c.date, name: c.name, upliftPct: c.upliftPct })),
    desk: { blendUnitsPerDay: round3(result.forecast), modelUnitsPerDay, confidence: result.confidence },
  };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
