import { describe, expect, it } from "vitest";
import raw from "@/lib/data/demo-data.json";
import { addDays, runDesk, SETTINGS } from "@/lib/forecast/desk";
import { buildSeries, runShopDesk, runShopDeskDetailed } from "@/lib/desk-service";
import { applyColdStart, COLD_START_DAYS, COLD_START_LABEL, coldStartBlend, daysOfSales, isColdStart } from "./cold-start";
import type { Item } from "@/lib/data/types";

const ASOF = "2026-11-12";
const item = (over: Partial<Item> = {}): Item => ({ id: "N1", name: "New Item", category: "", pack: "1 kg", price: 0, distributorId: "D1", leadTimeDays: 2, minSafetyStock: 2, orderCoverDays: 7, currentStock: 5, estimatedPerDay: 10, ...over });
const input = (it: Item) => ({ itemId: it.id, leadTimeDays: it.leadTimeDays, minSafetyStock: it.minSafetyStock, orderCoverDays: it.orderCoverDays, currentStock: it.currentStock, onOrder: 0 });
/** n days of sales ending on ASOF, qty each day (zero days are not added). */
const sales = (id: string, days: number, qty: number) => Array.from({ length: days }, (_, k) => ({ date: addDays(ASOF, -k), itemId: id, qty }));

describe("the cold-start blend: weight on real sales = days of data / 14", () => {
  it("no sales yet: the forecast is the owner's estimate", () => {
    const b = coldStartBlend({ estimate: 10, realUnits: 0, daysOfData: 0 });
    expect(b.weightReal).toBe(0);
    expect(b.forecast).toBe(10);
  });
  it("7 days of sales: half the real average, half the estimate", () => {
    // 28 units in 7 days = 4 a day. Estimate 10. 0.5 x 4 + 0.5 x 10 = 7.
    const b = coldStartBlend({ estimate: 10, realUnits: 28, daysOfData: 7 });
    expect(b.weightReal).toBe(0.5);
    expect(b.realAvg).toBe(4);
    expect(b.forecast).toBe(7);
  });
  it("10 days: weight 10/14", () => {
    const b = coldStartBlend({ estimate: 10, realUnits: 60, daysOfData: 10 }); // real 6 a day
    expect(b.weightReal).toBeCloseTo(10 / 14, 12);
    expect(b.forecast).toBeCloseTo((10 / 14) * 6 + (4 / 14) * 10, 12);
  });
  it("14 days: all real sales (the estimate has no weight left)", () => {
    const b = coldStartBlend({ estimate: 10, realUnits: 56, daysOfData: 14 });
    expect(b.weightReal).toBe(1);
    expect(b.forecast).toBe(4);
  });
  it("moves smoothly from the estimate towards the real average as days pass", () => {
    const f = (d: number) => coldStartBlend({ estimate: 10, realUnits: 4 * d, daysOfData: d }).forecast;
    for (let d = 1; d <= 14; d++) expect(f(d)).toBeLessThan(f(d - 1));
    expect(f(0)).toBe(10);
    expect(f(14)).toBe(4);
  });
  it("is used only with an estimate and fewer than 14 days of sales", () => {
    expect(isColdStart(10, 0)).toBe(true);
    expect(isColdStart(0, 3)).toBe(true); // "none sell" is still an estimate
    expect(isColdStart(10, 13)).toBe(true);
    expect(isColdStart(10, 14)).toBe(false);
    expect(isColdStart(10, 40)).toBe(false);
    expect(isColdStart(null, 3)).toBe(false);
    expect(isColdStart(undefined, 3)).toBe(false);
    expect(isColdStart(NaN, 3)).toBe(false);
    expect(COLD_START_DAYS).toBe(14);
  });
});

describe("a new item with an estimate on the reorder list", () => {
  it("with no sales: the forecast is the estimate, Low confidence, marked, and the order matches a hand calculation", () => {
    const it = item(); // estimate 10 a day, stock 5, lead time 2, cover 7, minimum safety 2
    const series = buildSeries(it.id, [], ASOF);
    const base = runDesk(input(it), series, []);
    const r = applyColdStart(base, input(it), series, it.estimatedPerDay)!;
    expect(daysOfSales(series)).toBe(0);
    expect(r.result.forecast).toBe(10);
    expect(r.result.confidence).toBe("Low");
    expect(r.result.notes).toEqual([COLD_START_LABEL]);
    expect(COLD_START_LABEL).toBe("Your estimate, learning from your sales");
    // By hand: safety stock = larger of 2 and (spread 0 x 2) = 2. Reorder point = 10 x 2 + 2 = 22. Stock 5 is at or below it.
    // Order = 10 x (2 + 7) + 2 - 5 = 87.
    expect(r.result.decision.status).toBe("Reorder today");
    expect(r.result.decision.safetyStock).toBe(2);
    expect(r.result.decision.reorderPoint).toBe(22);
    expect(r.result.decision.orderQty).toBe(87);
  });
  it("with 7 days of sales of 4 a day: forecast 7 (half and half) and an order of 60", () => {
    const it = item();
    const s = sales(it.id, 7, 4);
    const series = buildSeries(it.id, s, ASOF);
    const r = applyColdStart(runDesk(input(it), series, []), input(it), series, 10)!;
    expect(daysOfSales(series)).toBe(7);
    expect(r.info).toMatchObject({ weightReal: 0.5, realAvg: 4, forecast: 7, daysOfData: 7 });
    expect(r.result.forecast).toBe(7);
    // safety 2, reorder point 7 x 2 + 2 = 16 >= stock 5; order = ceil(7 x 9 + 2 - 5) = 60
    expect(r.result.decision.orderQty).toBe(60);
    expect(r.result.confidence).toBe("Low");
  });
  it("a stocked-up new item is not reordered, by the Desk's own rule", () => {
    const it = item({ currentStock: 500 });
    const series = buildSeries(it.id, [], ASOF);
    const r = applyColdStart(runDesk(input(it), series, []), input(it), series, 10)!;
    expect(r.result.decision.status).toBe("Don't reorder"); // 50 days of stock is more than the overstock limit
    expect(r.result.decision.coverDays).toBe(50);
    expect(SETTINGS.overstockCoverDays).toBeLessThan(50);
  });
  it("an estimate of 0 (does not sell yet) is not reordered", () => {
    const it = item({ estimatedPerDay: 0, currentStock: 0 });
    const series = buildSeries(it.id, [], ASOF);
    const r = applyColdStart(runDesk(input(it), series, []), input(it), series, 0)!;
    expect(r.result.forecast).toBe(0);
    expect(r.result.decision.status).toBe("Don't reorder");
  });
});

describe("the Forecast Desk is unchanged", () => {
  const asDeskItems = (extra: Partial<Item> = {}): Item[] => raw.items.map((i) => ({ ...i, ...extra }));
  const rawSales = raw.sales.map(([date, itemId, qty]) => ({ date: date as string, itemId: itemId as string, qty: qty as number }));
  const args = { asOf: raw.lastDataDay, sales: rawSales, calendar: raw.calendar, onOrder: {} as Record<string, number> };

  it("an item with 14 or more days of sales gets the Desk's own result even if it has an estimate", () => {
    const plain = runShopDesk({ ...args, items: asDeskItems() });
    const withEstimate = runShopDeskDetailed({ ...args, items: asDeskItems({ estimatedPerDay: 3 }) });
    // every demo item has 30 days of sales, so none is "cold" and every result is identical
    expect(withEstimate.coldStart.size).toBe(0);
    for (const [id, r] of plain) expect(withEstimate.results.get(id), id).toEqual(r);
  });
  it("an item without an estimate is exactly as before, whatever its number of days (existing shops and the demo shop)", () => {
    const direct = new Map(raw.items.map((i) => {
      const inp = { itemId: i.id, leadTimeDays: i.leadTimeDays, minSafetyStock: i.minSafetyStock, orderCoverDays: i.orderCoverDays, currentStock: i.currentStock, onOrder: 0 };
      return [i.id, runDesk(inp, buildSeries(i.id, rawSales, raw.lastDataDay), raw.calendar)];
    }));
    const now = runShopDeskDetailed({ ...args, items: asDeskItems() });
    expect(now.coldStart.size).toBe(0);
    for (const [id, r] of direct) expect(now.results.get(id), id).toEqual(r);
    expect(direct.size).toBe(30);
  });
  it("a new item with an estimate in a shop of 30 items changes only its own result", () => {
    const fresh = item({ id: "NEW1", estimatedPerDay: 6 });
    const before = runShopDesk({ ...args, items: asDeskItems() });
    const after = runShopDeskDetailed({ ...args, items: [...asDeskItems(), fresh] });
    for (const [id, r] of before) expect(after.results.get(id), id).toEqual(r);
    expect(after.coldStart.has("NEW1")).toBe(true);
    expect(after.results.get("NEW1")!.forecast).toBe(6);
  });
  it("the nightly job (runShopDesk) saves the same numbers the screens show", () => {
    const items = [...asDeskItems(), item({ id: "NEW1", estimatedPerDay: 6 })];
    const a = runShopDesk({ ...args, items });
    const b = runShopDeskDetailed({ ...args, items });
    expect([...a.keys()]).toEqual([...b.results.keys()]);
    for (const [id, r] of a) expect(b.results.get(id)).toEqual(r);
  });
  it("one real sale day later, the same new item is blended: 1 day of data = 1/14 weight", () => {
    const it = item({ id: "NEW2", estimatedPerDay: 8 });
    const one = runShopDeskDetailed({ asOf: ASOF, items: [it], sales: [{ date: ASOF, itemId: "NEW2", qty: 14 }], calendar: [], onOrder: {} });
    const info = one.coldStart.get("NEW2")!;
    expect(info.daysOfData).toBe(1);
    expect(info.forecast).toBeCloseTo((1 / 14) * 14 + (13 / 14) * 8, 12);
  });
});
