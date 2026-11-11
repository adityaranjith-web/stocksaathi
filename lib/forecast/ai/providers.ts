// Built-in AI providers. SERVER ONLY: the "http" provider reads AI_FORECAST_KEY, which must never reach the browser.
import type { AiForecastRequest, AiForecastResult, Forecaster } from "./types";

if (typeof window !== "undefined") throw new Error("AI providers run on the server only.");

/** Checks what an AI service sent back. Throws a plain sentence when it is not usable. */
export function parseAiResult(json: unknown): AiForecastResult {
  const o = (json ?? {}) as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const units = num(o.unitsPerDay);
  if (units === null || units < 0 || units > 100000) throw new Error("The AI answer has no valid unitsPerDay.");
  const low = num(o.low);
  const high = num(o.high);
  const result: AiForecastResult = { unitsPerDay: units };
  if (low !== null && high !== null && low >= 0 && low <= units && units <= high) { result.low = low; result.high = high; }
  if (typeof o.note === "string") result.note = o.note.slice(0, 200);
  return result;
}

/** A stand-in "AI" for trying the system without any account: the average of the last 7 days, with a 20% range. */
export const mockForecaster: Forecaster = {
  id: "mock",
  name: "Practice AI (7-day average)",
  async forecast(req: AiForecastRequest) {
    const last = req.salesDaily.slice(-7);
    const avg = last.length ? last.reduce((a, d) => a + d.qty, 0) / last.length : 0;
    return { unitsPerDay: avg, low: avg * 0.8, high: avg * 1.2, note: "Practice model: the plain 7-day average." };
  },
};

/**
 * Any AI service behind a web address. It receives the request as JSON (POST) and must answer
 * { "unitsPerDay": number, "low"?: number, "high"?: number, "note"?: string }.
 */
export function httpForecaster(url: string, key: string | undefined, timeoutMs = 15000): Forecaster {
  return {
    id: "http",
    name: "AI service",
    async forecast(req: AiForecastRequest) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
          body: JSON.stringify(req),
          signal: ctl.signal,
        });
        if (!res.ok) throw new Error(`The AI service answered ${res.status}.`);
        return parseAiResult(await res.json());
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
