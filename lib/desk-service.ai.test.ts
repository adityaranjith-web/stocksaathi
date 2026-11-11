import { afterEach, describe, expect, it } from "vitest";
import { addDays } from "@/lib/forecast/desk";
import { asOfDay } from "@/lib/dates";
import { computeShopDesk } from "./desk-service";
import type { AiForecastRow, Item, Store } from "@/lib/data/types";

// A small shop: 5 items that sell exactly 10 a day, with 40 in stock.
const asOf = asOfDay();
const items: Item[] = ["A", "B", "C", "D", "E"].map((id) => ({
  id, name: `Item ${id}`, category: "Test", pack: "1", price: 10, distributorId: "D", leadTimeDays: 2, minSafetyStock: 2, orderCoverDays: 7, currentStock: 40,
}));
const sales = items.flatMap((it) => Array.from({ length: 56 }, (_, k) => ({ date: addDays(asOf, -k), itemId: it.id, qty: 10 })));

function store(aiRows: AiForecastRow[]): Store {
  return {
    listItems: async () => items, listDistributors: async () => [], listSales: async () => sales, listCalendar: async () => [], openOrderQty: async () => ({}),
    listAiForecasts: async () => aiRows,
  } as unknown as Store;
}

// 15 earlier days x 5 items: the AI said exactly 10 (right), the Forecast Desk said 14 (wrong).
const history: AiForecastRow[] = Array.from({ length: 15 }, (_, d) => items.map((it): AiForecastRow => ({
  runDate: addDays(asOf, -30 + d), itemId: it.id, provider: "mock", aiUnitsPerDay: 10, blendUnitsPerDay: 14, horizonDays: 9, low: null, high: null,
}))).flat();
const todayRow: AiForecastRow = { runDate: asOf, itemId: "A", provider: "mock", aiUnitsPerDay: 16, blendUnitsPerDay: 10, horizonDays: 9, low: null, high: null };

const OLD = { mode: process.env.AI_MODE, which: process.env.AI_FORECASTER };
afterEach(() => { process.env.AI_MODE = OLD.mode; process.env.AI_FORECASTER = OLD.which; if (OLD.mode === undefined) delete process.env.AI_MODE; if (OLD.which === undefined) delete process.env.AI_FORECASTER; });

describe("AI in the shop desk", () => {
  it("changes nothing when AI is off (the default)", async () => {
    delete process.env.AI_MODE;
    const d = await computeShopDesk(store([...history, todayRow]));
    expect(d.results.get("A")!.notes.some((n) => n.includes("AI second opinion"))).toBe(false);
    expect(d.results.get("A")!.forecast).toBeCloseTo(10, 6);
  });

  it("shadow mode does not change orders either", async () => {
    process.env.AI_MODE = "shadow"; process.env.AI_FORECASTER = "mock";
    const d = await computeShopDesk(store([...history, todayRow]));
    expect(d.results.get("A")!.forecast).toBeCloseTo(10, 6);
  });

  it("blend mode mixes in a proven AI model, only for items with a fresh AI forecast", async () => {
    process.env.AI_MODE = "blend"; process.env.AI_FORECASTER = "mock";
    const d = await computeShopDesk(store([...history, todayRow]));
    expect(d.results.get("A")!.forecast).toBeCloseTo(0.7 * 10 + 0.3 * 16, 6); // 11.8
    expect(d.results.get("A")!.notes.at(-1)).toContain("AI second opinion mixed in at 30%");
    expect(d.results.get("B")!.forecast).toBeCloseTo(10, 6); // no fresh AI row for B
  });

  it("blend mode ignores an AI model that has not proved itself", async () => {
    process.env.AI_MODE = "blend"; process.env.AI_FORECASTER = "mock";
    const d = await computeShopDesk(store([...history.slice(0, 10), todayRow])); // too little history
    expect(d.results.get("A")!.forecast).toBeCloseTo(10, 6);
  });

  it("useAi=false always gives the pure Forecast Desk answer", async () => {
    process.env.AI_MODE = "blend"; process.env.AI_FORECASTER = "mock";
    const d = await computeShopDesk(store([...history, todayRow]), { useAi: false });
    expect(d.results.get("A")!.forecast).toBeCloseTo(10, 6);
  });
});
