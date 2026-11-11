import { describe, expect, it } from "vitest";
import { blend, boundWeights, confidenceOf, decide, runDesk, addDays, type SalesSeries } from "./desk";
import { buildSeries } from "@/lib/desk-service";
import raw from "@/lib/data/demo-data.json";

const sugar = { itemId: "I004", leadTimeDays: 2, minSafetyStock: 4, orderCoverDays: 7, currentStock: 12, onOrder: 0 };

describe("BRD Appendix A4 worked example (Sugar 1 kg)", () => {
  const b = blend([
    { model: "M1", forecast: 9.6, mae: 2.0 },
    { model: "M2", forecast: 8.7, mae: 2.5 },
    { model: "M3", forecast: 9.0, mae: 2.0 },
    { model: "M4", forecast: 9.4, mae: 1.6 },
    { model: "M5", forecast: 11.0, mae: 3.2 },
  ]);
  it("weights follow 1 / miss", () => {
    expect(b.members.map((m) => +(m.weight * 100).toFixed(1))).toEqual([21.4, 17.1, 21.4, 26.7, 13.4]);
  });
  it("blended forecast is 9.45 a day with spread 2.3 (Medium)", () => {
    expect(b.forecast).toBeCloseTo(9.451, 3);
    expect(b.spread).toBeCloseTo(2.3, 6);
    expect(confidenceOf(b.forecast, b.spread)).toBe("Medium");
  });
  it("orders 78 units", () => {
    const d = decide(sugar, b.forecast, b.spread, 122);
    expect(d.status).toBe("Reorder today");
    expect(d.safetyStock).toBeCloseTo(4.6, 6);
    expect(d.reorderPoint).toBeCloseTo(23.5, 1);
    expect(d.orderQty).toBe(78);
  });
});

describe("business rules", () => {
  it("BR5: weights stay between 5% and 60%", () => {
    const w = boundWeights([100, 1, 1, 1, 1], 0.05, 0.6);
    expect(Math.max(...w)).toBeCloseTo(0.6, 6);
    expect(Math.min(...w)).toBeGreaterThanOrEqual(0.05 - 1e-9);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
  it("BR2: daily-delivered milk orders 1 day of cover, not 7", () => {
    const milk = { itemId: "I008", leadTimeDays: 1, minSafetyStock: 20, orderCoverDays: 1, currentStock: 30, onOrder: 0 };
    const d = decide(milk, 40, 4, 500);
    expect(d.orderQty).toBe(70); // 40 x (1 + 1) + 20 - 30
  });
  it("BR4: no sale in 14 days means don't reorder", () => {
    expect(decide(sugar, 0, 0, 0).status).toBe("Don't reorder");
  });
  it("BR4: more than 30 days of cover means don't reorder", () => {
    expect(decide({ ...sugar, currentStock: 400 }, 9, 1, 120).status).toBe("Don't reorder");
  });
  it("BR1: stock already on order counts against the reorder point", () => {
    expect(decide({ ...sugar, onOrder: 50 }, 9.45, 2.3, 122).status).toBe("OK");
  });
});

function series(qty: number[], end = "2026-10-29"): SalesSeries {
  const dates = qty.map((_, i) => addDays(end, i - qty.length + 1));
  return { dates, qty };
}

describe("condition gate and guard rail", () => {
  it("new item (under 14 days) uses only M2 and shows Low confidence", () => {
    const r = runDesk(sugar, series([5, 6, 4, 5, 7, 6, 5, 4, 6, 5]), []);
    expect(r.members.map((m) => m.model)).toEqual(["M2"]);
    expect(r.confidence).toBe("Low");
  });
  it("festival ahead gives the look-alike model at least 30%", () => {
    const qty = Array.from({ length: 42 }, (_, i) => 8 + (i % 3));
    const r = runDesk(sugar, series(qty, "2026-11-03"), [{ date: "2026-11-08", name: "Deepavali", upliftPct: 40 }]);
    expect(r.members.find((m) => m.model === "M5")!.weight).toBeGreaterThanOrEqual(0.3 - 1e-9);
    expect(r.notes.join(" ")).toContain("Deepavali");
  });
  it("BR6: a sudden spike with no event is capped at 2x the 28-day average", () => {
    const qty = [...Array(40).fill(5), 60, 60, 60, 60, 60, 60, 60];
    const r = runDesk({ ...sugar, currentStock: 1000 }, series(qty), []);
    expect(r.guardRail).toBe(true);
    expect(r.forecast).toBeCloseTo(2 * r.avg28, 6);
  });
});

describe("Session 6 demo data", () => {
  const sales = raw.sales.map(([date, itemId, qty]) => ({ date: date as string, itemId: itemId as string, qty: qty as number }));
  const results = raw.items.map((it) =>
    runDesk({ itemId: it.id, leadTimeDays: it.leadTimeDays, minSafetyStock: it.minSafetyStock, orderCoverDays: it.orderCoverDays, currentStock: it.currentStock, onOrder: 0 },
      buildSeries(it.id, sales, raw.lastDataDay), []));
  it("flags all 3 planted slow items and puts none of them on the reorder list", () => {
    const dont = results.filter((r) => r.decision.status === "Don't reorder").map((r) => r.itemId).sort();
    expect(dont).toEqual(["I027", "I028", "I029"]);
  });
  it("every blended forecast is the weighted average of its models", () => {
    for (const r of results) {
      if (r.guardRail) continue;
      const w = r.members.reduce((a, m) => a + m.weight * m.forecast, 0);
      expect(r.forecast).toBeCloseTo(w, 9);
      expect(r.members.reduce((a, m) => a + m.weight, 0)).toBeCloseTo(1, 9);
    }
  });
});

describe("weight bounds stress check", () => {
  it("2,000 random weight sets stay within bounds and sum to 100%", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let k = 0; k < 2000; k++) {
      const n = 2 + (k % 4);
      const raw = Array.from({ length: n }, () => rand() ** 3 * 20 + 0.01);
      const floors = k % 3 === 0 ? [0, 0, 0.3].slice(0, n) : [];
      const w = boundWeights(raw, 0.05, 0.6, floors);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      w.forEach((x, i) => {
        expect(x).toBeLessThanOrEqual(0.6 + 1e-9);
        expect(x).toBeGreaterThanOrEqual(Math.max(0.05, floors[i] ?? 0) - 1e-9);
      });
    }
  });
});
