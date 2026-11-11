import { describe, expect, it } from "vitest";
import { addDays, type SalesSeries } from "@/lib/forecast/desk";
import { closingStock, compareForecastError, improvementPct, outOfStockItemDays, slowStockValue, walkForwardError } from "./scorecard";
import { averagePrepSeconds, cleanPrepSeconds, clock, formatPrepTime } from "./prep-time";

const ASOF = "2026-11-10";

function series(days: number, f: (date: string, i: number) => number): SalesSeries {
  const start = addDays(ASOF, -(days - 1));
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  return { dates, qty: dates.map((d, i) => f(d, i)) };
}

describe("FR10 out-of-stock item-days", () => {
  it("works stock backwards: stock now + sold after - received after", () => {
    // Stock is 8 now. Today (after the last complete day) 2 were sold and 10 arrived.
    // So at the end of 10 Nov the stock was 8 + 2 - 10 = 0.
    const sales = [{ date: "2026-11-11", itemId: "A", qty: 2 }];
    const deliveries = [{ date: "2026-11-11", itemId: "A", qty: 10 }];
    expect(closingStock(8, ASOF, sales, deliveries)).toBe(0);
  });

  it("counts a day with zero closing stock, and only that day", () => {
    // Stock is 0 now; 4 were sold on 10 Nov. End of 10 Nov: 0 (out). End of 9 Nov: 0 + 4 = 4 (in stock).
    const r = outOfStockItemDays({
      items: [{ id: "A", currentStock: 0 }],
      sales: [{ date: "2026-11-10", itemId: "A", qty: 4 }],
      deliveries: [],
      asOf: ASOF,
      days: 2,
    });
    expect(r.itemDays).toBe(1);
    expect(r.possibleItemDays).toBe(2);
    expect(r.ratePct).toBeCloseTo(50, 9);
  });

  it("only looks at the top N items by units sold", () => {
    const sales = [
      { date: "2026-11-09", itemId: "A", qty: 30 },
      { date: "2026-11-09", itemId: "B", qty: 20 },
      { date: "2026-11-09", itemId: "C", qty: 1 },
    ];
    const r = outOfStockItemDays({
      items: [{ id: "A", currentStock: 5 }, { id: "B", currentStock: 5 }, { id: "C", currentStock: 0 }],
      sales, deliveries: [], asOf: ASOF, days: 3, topN: 2,
    });
    expect(r.topItemIds).toEqual(["A", "B"]);
    expect(r.possibleItemDays).toBe(6); // 2 items x 3 days
    expect(r.itemDays).toBe(0); // item C is out of stock but is not a top item
  });

  it("can look at the week before", () => {
    const r = outOfStockItemDays({
      items: [{ id: "A", currentStock: 50 }],
      sales: [{ date: "2026-11-01", itemId: "A", qty: 60 }],
      deliveries: [],
      asOf: ASOF, days: 3, endOffsetDays: 7,
    });
    // Window is 1 to 3 Nov. Stock after 1 Nov sales was 50 + 0 later sales... closing(1 Nov) = 50 (nothing after), fine.
    expect(r.possibleItemDays).toBe(3);
    expect(r.itemDays).toBe(0);
  });

  it("an empty shop gives 0%, not a crash", () => {
    const r = outOfStockItemDays({ items: [], sales: [], deliveries: [], asOf: ASOF });
    expect(r).toMatchObject({ itemDays: 0, possibleItemDays: 0, ratePct: 0 });
  });
});

describe("FR10 forecast error: blend against plain 28-day average", () => {
  it("improvement is (1 - blend / simple) x 100", () => {
    expect(improvementPct(1.8, 2)).toBeCloseTo(10, 9);
    expect(improvementPct(2, 2)).toBeCloseTo(0, 9);
    expect(improvementPct(0, 0)).toBeNull();
  });

  it("a flat item has no error for either method", () => {
    const r = walkForwardError(series(50, () => 10), [])!;
    expect(r.blend).toBeCloseTo(0, 9);
    expect(r.simple).toBeCloseTo(0, 9);
  });

  it("a strong weekly pattern: the blend beats the plain average", () => {
    // Weekends sell 20, other days sell 5. The weekday model learns this; the 28-day average cannot.
    const weekly = series(56, (d) => {
      const w = new Date(d + "T00:00:00Z").getUTCDay();
      return w === 0 || w === 6 ? 20 : 5;
    });
    const r = walkForwardError(weekly, [])!;
    expect(r.days).toBe(7);
    expect(r.blend).toBeLessThan(r.simple);
    expect(improvementPct(r.blend, r.simple)!).toBeGreaterThan(10);
  });

  it("returns nothing when there is too little history", () => {
    expect(walkForwardError(series(10, () => 5), [])).toBeNull();
  });

  it("averages items equally and reports how many were tested", () => {
    const weekly = series(56, (d) => {
      const w = new Date(d + "T00:00:00Z").getUTCDay();
      return w === 0 || w === 6 ? 20 : 5;
    });
    const flat = series(56, () => 10);
    const r = compareForecastError([weekly, flat, series(5, () => 1)], []);
    expect(r.items).toBe(2); // the 5-day item is too new to test
    const a = walkForwardError(weekly, [])!;
    expect(r.blendError).toBeCloseTo(a.blend / 2, 9); // flat item has 0 error
    expect(r.simpleError).toBeCloseTo(a.simple / 2, 9);
  });
});

describe("FR10 slow stock value", () => {
  it("adds stock x price for slow items only", () => {
    expect(slowStockValue([
      { stock: 10, price: 95, slow: true }, // 950
      { stock: 300, price: 2, slow: true }, // 600
      { stock: 50, price: 100, slow: false }, // not counted
    ])).toBe(1550);
  });
  it("is 0 when nothing is slow", () => {
    expect(slowStockValue([{ stock: 5, price: 10, slow: false }])).toBe(0);
  });
});

describe("KPI 2 order preparation timer", () => {
  it("formats times in plain words", () => {
    expect(formatPrepTime(45)).toBe("45 s");
    expect(formatPrepTime(72)).toBe("1 min 12 s");
    expect(formatPrepTime(300)).toBe("5 min");
    expect(clock(42)).toBe("0:42");
    expect(clock(125)).toBe("2:05");
  });
  it("averages only believable times", () => {
    expect(averagePrepSeconds([60, 120, null, undefined])).toBe(90);
    expect(averagePrepSeconds([999999, null])).toBeNull(); // phone left open: ignored
    expect(averagePrepSeconds([])).toBeNull();
  });
  it("cleans a time sent by the phone", () => {
    expect(cleanPrepSeconds(41.6)).toBe(42);
    expect(cleanPrepSeconds(-3)).toBeNull();
    expect(cleanPrepSeconds("12")).toBeNull();
    expect(cleanPrepSeconds(Number.NaN)).toBeNull();
  });
});
