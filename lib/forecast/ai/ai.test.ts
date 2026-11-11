import { describe, expect, it } from "vitest";
import raw from "@/lib/data/demo-data.json";
import { runDesk, type DeskResult } from "@/lib/forecast/desk";
import { buildSeries } from "@/lib/desk-service";
import { buildAiRequest } from "./payload";
import { parseAiResult, mockForecaster } from "./providers";
import { getAiMode, getForecaster } from "./registry";
import { blendWithAi, evaluateShadow, shouldPromote, MAX_AI_WEIGHT } from "./evaluate";
import { applyAiBlend } from "./apply";
import type { AiForecastRow } from "@/lib/data/types";

const row = (over: Partial<AiForecastRow>): AiForecastRow => ({ runDate: "2026-11-01", itemId: "A", provider: "mock", aiUnitsPerDay: 10, blendUnitsPerDay: 10, horizonDays: 2, low: null, high: null, ...over });

describe("AI answers are checked before use", () => {
  it("accepts a good answer and keeps a sensible range", () => {
    expect(parseAiResult({ unitsPerDay: 9.5, low: 8, high: 11, note: "ok" })).toEqual({ unitsPerDay: 9.5, low: 8, high: 11, note: "ok" });
  });
  it("drops a range that does not surround the forecast", () => {
    expect(parseAiResult({ unitsPerDay: 9.5, low: 12, high: 20 })).toEqual({ unitsPerDay: 9.5 });
  });
  it("rejects missing, negative, huge, text and NaN numbers", () => {
    for (const bad of [{}, { unitsPerDay: -1 }, { unitsPerDay: 1e9 }, { unitsPerDay: "9" }, { unitsPerDay: NaN }, null, "x"]) {
      expect(() => parseAiResult(bad)).toThrow();
    }
  });
});

describe("AI settings", () => {
  it("is off unless switched on", () => {
    expect(getAiMode({})).toBe("off");
    expect(getAiMode({ AI_MODE: "nonsense" })).toBe("off");
    expect(getForecaster({ AI_FORECASTER: "mock" })).toBeNull(); // mode still off
  });
  it("uses the practice model in shadow mode", () => {
    expect(getAiMode({ AI_MODE: "Shadow" })).toBe("shadow");
    expect(getForecaster({ AI_MODE: "shadow", AI_FORECASTER: "mock" })?.id).toBe("mock");
  });
  it("only accepts secure web addresses for an AI service (or localhost)", () => {
    const on = { AI_MODE: "shadow", AI_FORECASTER: "http" };
    expect(getForecaster({ ...on, AI_FORECAST_URL: "https://ai.example.com/forecast" })?.id).toBe("http");
    expect(getForecaster({ ...on, AI_FORECAST_URL: "http://localhost:8000/forecast" })?.id).toBe("http");
    expect(getForecaster({ ...on, AI_FORECAST_URL: "http://ai.example.com/forecast" })).toBeNull();
    expect(getForecaster({ ...on })).toBeNull();
  });
});

describe("what leaves the app", () => {
  const it0 = raw.items[3];
  const items = raw.items.map((i) => ({ ...i }));
  const series = buildSeries(it0.id, raw.sales.map(([date, itemId, qty]) => ({ date: date as string, itemId: itemId as string, qty: qty as number })), raw.lastDataDay);
  const input = { itemId: it0.id, leadTimeDays: it0.leadTimeDays, minSafetyStock: it0.minSafetyStock, orderCoverDays: it0.orderCoverDays, currentStock: it0.currentStock, onOrder: 0 };
  const result = runDesk(input, series, raw.calendar);
  const req = buildAiRequest({ item: items[3], input, result, series, calendar: raw.calendar, asOf: raw.lastDataDay, horizonDays: 9 });

  it("holds no shop, owner, helper or distributor details", () => {
    const text = JSON.stringify(req);
    expect(text).not.toContain(raw.shop.name);
    expect(text).not.toContain(raw.shop.locality);
    for (const d of raw.distributors) { expect(text).not.toContain(d.salesman); expect(text).not.toContain(d.whatsapp); }
    for (const u of raw.users) expect(text).not.toContain(u.name);
    expect(Object.keys(req)).toEqual(["asOf", "horizonDays", "item", "salesDaily", "calendar", "desk"]);
  });
  it("carries the sales history and what the Forecast Desk says", () => {
    expect(req.salesDaily.length).toBe(series.qty.length);
    expect(req.desk.blendUnitsPerDay).toBeCloseTo(result.forecast, 3);
    expect(Object.keys(req.desk.modelUnitsPerDay).sort()).toEqual(["M1", "M2", "M3", "M4", "M5"]);
  });
  it("the practice model answers within its own range", async () => {
    const r = await mockForecaster.forecast(req);
    expect(r.low!).toBeLessThanOrEqual(r.unitsPerDay);
    expect(r.high!).toBeGreaterThanOrEqual(r.unitsPerDay);
  });
});

describe("checking an AI model against real sales", () => {
  // Forecast made on 1 Nov for the next 2 days. Real sales: 2 Nov = 8, 3 Nov = 12, so the real average is 10.
  const sales = [{ date: "2026-11-02", itemId: "A", qty: 8 }, { date: "2026-11-03", itemId: "A", qty: 12 }];
  it("compares both forecasts with the real average", () => {
    const ev = evaluateShadow([row({ aiUnitsPerDay: 9, blendUnitsPerDay: 7 })], sales, "2026-11-10");
    expect(ev.rows).toBe(1);
    expect(ev.aiError).toBeCloseTo(1, 9); // |9 - 10|
    expect(ev.blendError).toBeCloseTo(3, 9); // |7 - 10|
    expect(ev.improvementPct).toBeCloseTo((1 - 1 / 3) * 100, 9);
  });
  it("ignores forecasts whose days have not all passed", () => {
    const ev = evaluateShadow([row({ runDate: "2026-11-09" })], sales, "2026-11-10");
    expect(ev.rows).toBe(0);
    expect(ev.improvementPct).toBeNull();
  });
  it("counts different run days", () => {
    const ev = evaluateShadow([row({}), row({ runDate: "2026-11-02" }), row({ itemId: "B" })], sales, "2026-11-10");
    expect(ev.runDays).toBe(2);
  });
});

describe("when an AI model may be used in orders", () => {
  const good = { rows: 60, runDays: 14, aiError: 1.8, blendError: 2, improvementPct: 10 };
  it("needs enough days, enough checked forecasts and a 10% gain", () => {
    expect(shouldPromote(good).promote).toBe(true);
    expect(shouldPromote({ ...good, runDays: 13 }).promote).toBe(false);
    expect(shouldPromote({ ...good, rows: 49 }).promote).toBe(false);
    expect(shouldPromote({ ...good, improvementPct: 9.9 }).promote).toBe(false);
    expect(shouldPromote({ ...good, improvementPct: null }).promote).toBe(false);
  });
});

describe("mixing the AI into the blend", () => {
  it("30% AI and 70% Forecast Desk by default", () => {
    const r = blendWithAi(10, 20, 10, { festivalAhead: true });
    expect(r.unitsPerDay).toBeCloseTo(13, 9);
    expect(r.aiWeight).toBeCloseTo(0.3, 9);
  });
  it("the AI never gets more than 40%", () => {
    expect(blendWithAi(10, 20, 10, { aiWeight: 0.9, festivalAhead: true }).aiWeight).toBe(MAX_AI_WEIGHT);
    expect(blendWithAi(10, 20, 10, { aiWeight: -1 }).aiWeight).toBe(0);
  });
  it("BR6: capped at double the 28-day average when no festival is ahead", () => {
    const r = blendWithAi(10, 1000, 5, { aiWeight: 0.4 });
    expect(r.unitsPerDay).toBe(10);
    expect(r.capped).toBe(true);
  });
  it("changes the order quantity through the same BR rules", () => {
    const input = { itemId: "X", leadTimeDays: 2, minSafetyStock: 2, orderCoverDays: 7, currentStock: 5, onOrder: 0 };
    const series = { dates: Array.from({ length: 30 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`), qty: Array.from({ length: 30 }, () => 10) };
    const base: DeskResult = runDesk(input, series, []);
    const mixed = applyAiBlend(base, input, row({ itemId: "X", aiUnitsPerDay: 16 }), false);
    expect(mixed.forecast).toBeCloseTo(0.7 * base.forecast + 0.3 * 16, 6);
    expect(mixed.decision.orderQty).toBeGreaterThan(base.decision.orderQty);
    expect(mixed.notes.at(-1)).toContain("AI second opinion mixed in at 30%");
    expect(applyAiBlend(base, input, undefined, false)).toBe(base); // no AI row: nothing changes
  });
});
