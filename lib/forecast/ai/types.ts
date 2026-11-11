// Plug-in system for AI forecasts. See docs/ai-integration.md.
// The five-model Forecast Desk stays the source of truth. An AI model is a "second opinion" that is first
// recorded and checked against real sales, and only used in orders after it has proved itself.
import type { CalendarDay, Confidence } from "@/lib/forecast/desk";

/** off: nothing runs. shadow: AI forecasts are saved and checked, orders are not changed. blend: a proven AI model is mixed into orders. */
export type AiMode = "off" | "shadow" | "blend";

/** What an AI model receives for one item. It holds no shop name, owner, helper, supplier or customer details. */
export interface AiForecastRequest {
  asOf: string; // last complete day, YYYY-MM-DD
  horizonDays: number; // forecast the average units per day over this many days after asOf
  item: { id: string; name: string; category: string; pack: string; price: number; leadTimeDays: number; orderCoverDays: number; currentStock: number; onOrder: number };
  salesDaily: { date: string; qty: number }[]; // up to 56 days, oldest first, zero-filled
  calendar: CalendarDay[]; // festival and holiday dates with the team's uplift %
  desk: { blendUnitsPerDay: number; modelUnitsPerDay: Record<string, number>; confidence: Confidence }; // what the Forecast Desk says
}

/** What an AI model sends back. */
export interface AiForecastResult {
  unitsPerDay: number; // average units per day over the next horizonDays
  low?: number; // optional range
  high?: number;
  note?: string; // optional one-line reason
}

export interface Forecaster {
  id: string; // saved with every forecast, e.g. "mock" or "http"
  name: string; // shown on screen
  forecast(request: AiForecastRequest): Promise<AiForecastResult>;
}
