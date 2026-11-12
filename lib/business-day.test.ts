import { describe, expect, it } from "vitest";
import raw from "@/lib/data/demo-data.json";
import { addDays, SETTINGS } from "@/lib/forecast/desk";
import { daysBetween, todayIST } from "@/lib/dates";
import { computeShopDesk } from "@/lib/desk-service";
import { demoStore } from "@/lib/data/demo";
import { runNightly, type NightlyDb, type ShopData } from "@/lib/nightly";
import { asOfFor, effectiveBusinessDate, fillGaps, gapDays, SAMPLE_FILL_UNTIL, SAMPLE_MIN_SALES, sampleSalesForDay } from "./business-day";
import type { Item, Sale } from "@/lib/data/types";

// The Session 6 demo data, moved so that it ends on 10 Nov 2026, like the real demo shop's sample sales.
const LAST = "2026-11-10";
const shift = daysBetween(raw.lastDataDay, LAST);
const items: Item[] = raw.items.map((i) => ({ ...i }));
const itemIds = items.map((i) => i.id);
const base: Sale[] = raw.sales.map(([date, itemId, qty]) => ({ date: addDays(date as string, shift), itemId: itemId as string, qty: qty as number }));
const nameOf = (id: string) => items.find((i) => i.id === id)!.name;
const SLOW = ["Premium Basmati Rice", "Room Freshener Spray", "Coconut Hair Oil"];

describe("the business date", () => {
  it("follows the real date, and never falls behind it", () => {
    expect(effectiveBusinessDate(null, "2026-11-13")).toBe("2026-11-13");
    expect(effectiveBusinessDate(undefined, "2026-11-13")).toBe("2026-11-13");
    expect(effectiveBusinessDate("2026-11-10", "2026-11-13")).toBe("2026-11-13"); // a date in the past counts as the real date
    expect(effectiveBusinessDate("2026-11-16", "2026-11-13")).toBe("2026-11-16"); // days closed ahead
  });
  it("the Forecast Desk works up to the day before the business date", () => {
    expect(asOfFor("2026-11-13")).toBe("2026-11-12");
  });
});

describe("sample sales follow the pattern in the shop's own history", () => {
  // Fill 6 weeks after the data ends, then look at what came out.
  const added = fillGaps({ sales: base, itemIds, asOf: addDays(LAST, 42), fillUntil: "2099-01-01" });
  const days = Array.from({ length: 42 }, (_, i) => addDays(LAST, i + 1));

  it("fills every day, and the same history always gives the same sample sales", () => {
    expect(new Set(added.map((r) => r.date))).toEqual(new Set(days));
    const again = fillGaps({ sales: base, itemIds, asOf: addDays(LAST, 42), fillUntil: "2099-01-01" });
    expect(again).toEqual(added);
  });
  it("the 3 slow items stay slow, and the fast items sell every day", () => {
    for (const id of itemIds) {
      const mine = added.filter((r) => r.itemId === id);
      const history = base.filter((s) => s.itemId === id);
      const histDays = new Set(history.map((s) => s.date)).size;
      const histShare = histDays / new Set(base.map((s) => s.date)).size;
      const share = mine.length / days.length;
      if (SLOW.includes(nameOf(id))) {
        expect(share, nameOf(id)).toBeLessThan(0.6); // sells now and then
        expect(mine.reduce((a, r) => a + r.qty, 0) / days.length, nameOf(id)).toBeLessThan(1.5); // under about 1 unit a day
      } else if (histShare > 0.95) {
        expect(share, nameOf(id)).toBeGreaterThan(0.95); // fast items sell on almost every day
      }
    }
  });
  it("each item keeps about its usual size (within 35% of its history)", () => {
    for (const id of itemIds) {
      const hist = base.filter((s) => s.itemId === id).reduce((a, s) => a + s.qty, 0) / 30;
      const gen = added.filter((r) => r.itemId === id).reduce((a, r) => a + r.qty, 0) / days.length;
      if (hist < 5) continue; // tiny items are too noisy to compare
      expect(gen / hist, nameOf(id)).toBeGreaterThan(0.65);
      expect(gen / hist, nameOf(id)).toBeLessThan(1.35);
    }
  });
  it("keeps the weekday effect: Sunday and Monday are busier than the rest", () => {
    const total = new Map<string, number>();
    for (const r of added) total.set(r.date, (total.get(r.date) ?? 0) + r.qty);
    const dow = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();
    const avg = (pick: (d: number) => boolean) => { const v = [...total].filter(([d]) => pick(dow(d))).map(([, t]) => t); return v.reduce((a, b) => a + b, 0) / v.length; };
    expect(avg((d) => d === 0 || d === 1)).toBeGreaterThan(avg((d) => d >= 2 && d <= 6) * 1.05);
  });
  it("nothing is invented for an item with no history, and quantities are whole numbers of at least 1", () => {
    expect(sampleSalesForDay("2026-11-12", ["not-an-item"], base)).toEqual([]);
    expect(sampleSalesForDay("2026-11-12", itemIds, [])).toEqual([]);
    for (const r of added) { expect(Number.isInteger(r.qty)).toBe(true); expect(r.qty).toBeGreaterThanOrEqual(1); }
  });
});

describe("gaps in the sales history", () => {
  it("a day with fewer than 5 sales is a gap, counted from the first day that has sales", () => {
    const sales = [...base, { date: "2026-11-12", itemId: "I001", qty: 3 }];
    const gaps = gapDays(sales, "2026-11-13");
    expect(gaps).toEqual(["2026-11-11", "2026-11-12", "2026-11-13"]); // 12 Nov has only 1 sale
    expect(gapDays([], "2026-11-13")).toEqual([]);
    expect(SAMPLE_MIN_SALES).toBe(5);
  });
  it("never fills after the cut-off date", () => {
    const rows = fillGaps({ sales: base, itemIds, asOf: "2026-12-05" });
    expect(Math.max(...rows.map((r) => r.date.localeCompare(SAMPLE_FILL_UNTIL)))).toBeLessThanOrEqual(0);
    expect(rows.some((r) => r.date > SAMPLE_FILL_UNTIL)).toBe(false);
    expect(rows.some((r) => r.date === SAMPLE_FILL_UNTIL)).toBe(true);
  });
});

describe("the demo shop never has a zero-sales gap, night after night until 27 Nov", () => {
  // A stateful pretend database with the demo shop (sample shop) and a normal shop that has the same gap.
  function database() {
    const shops: Record<string, { sampleShop: boolean; sales: Sale[] }> = {
      DEMO: { sampleShop: true, sales: base.map((s) => ({ ...s })) },
      OTHER: { sampleShop: false, sales: base.map((s) => ({ ...s })) },
    };
    const sampleCalls: string[] = [];
    const db: NightlyDb = {
      listShopIds: async () => Object.keys(shops),
      loadShop: async (id): Promise<ShopData> => ({ items, sales: shops[id].sales.map((s) => ({ ...s })), calendar: [], onOrder: {}, sampleShop: shops[id].sampleShop }),
      saveRows: async () => {},
      saveSampleSales: async (id, rows) => {
        sampleCalls.push(id);
        if (!shops[id].sampleShop) throw new Error("Sample sales are only for the demo shop.");
        shops[id].sales.push(...rows.map((r) => ({ date: r.date, itemId: r.itemId, qty: r.qty })));
      },
    };
    return { db, shops, sampleCalls };
  }
  const perDay = (sales: Sale[]) => { const m = new Map<string, number>(); for (const s of sales) m.set(s.date, (m.get(s.date) ?? 0) + 1); return m; };

  it("every night from 12 Nov to 27 Nov leaves no day without sales in the demo shop", async () => {
    const { db, shops } = database();
    for (let run = addDays(LAST, 1); run <= SAMPLE_FILL_UNTIL; run = addDays(run, 1)) {
      const summary = await runNightly(db, run);
      expect(summary.failedShops).toBe(0);
      const counts = perDay(shops.DEMO.sales);
      for (let d = addDays(LAST, -29); d <= run; d = addDays(d, 1)) {
        expect(counts.get(d) ?? 0, `${d} after the night of ${run}`).toBeGreaterThanOrEqual(SAMPLE_MIN_SALES);
      }
    }
  });
  it("the first night fills the gap that has opened since the real sales ended", async () => {
    const { db, shops } = database();
    const s = await runNightly(db, "2026-11-12"); // the night's date is the last complete day: 11 and 12 Nov are empty
    const counts = perDay(shops.DEMO.sales);
    expect(counts.get("2026-11-11")).toBeGreaterThanOrEqual(5);
    expect(counts.get("2026-11-12")).toBeGreaterThanOrEqual(5);
    expect(s.sampleSales).toBe(shops.DEMO.sales.length - base.length);
  });
  it("another shop is never touched: no sample sale, no database call for it", async () => {
    const { db, shops, sampleCalls } = database();
    for (let run = addDays(LAST, 1); run <= "2026-11-20"; run = addDays(run, 1)) await runNightly(db, run);
    expect(shops.OTHER.sales).toHaveLength(base.length);
    expect(new Set(sampleCalls)).toEqual(new Set(["DEMO"]));
  });
  it("after 27 Nov nothing is added any more", async () => {
    const { db, shops } = database();
    for (let run = addDays(LAST, 1); run <= SAMPLE_FILL_UNTIL; run = addDays(run, 1)) await runNightly(db, run);
    const before = shops.DEMO.sales.length;
    const s = await runNightly(db, addDays(SAMPLE_FILL_UNTIL, 1));
    expect(s.sampleSales).toBe(0);
    expect(shops.DEMO.sales).toHaveLength(before);
  });
  it("running the same night twice adds nothing the second time", async () => {
    const { db } = database();
    await runNightly(db, "2026-11-14");
    const again = await runNightly(db, "2026-11-14");
    expect(again.sampleSales).toBe(0);
  });
});

describe("Close the day: sell 10 sugar, close the day, the numbers move as a hand calculation says", () => {
  const sugar = raw.items.find((i) => i.name === "Sugar")!;
  const member = (r: { members: { model: string; forecast: number }[] }, m: string) => r.members.find((x) => x.model === m)!.forecast;

  it("changes the 7-day average, the forecast and the reorder quantity", async () => {
    const real = todayIST();
    const before = await computeShopDesk(demoStore, { useAi: false });
    expect(before.businessDate).toBe(real);
    expect(before.asOf).toBe(addDays(real, -1));
    const rBefore = before.results.get(sugar.id)!;

    await demoStore.addSale(sugar.id, 10, "Quick tap"); // sold today: stock 12 -> 2
    const sameDay = await computeShopDesk(demoStore, { useAi: false });
    // today is not finished, so it is not in the forecast yet
    expect(sameDay.results.get(sugar.id)!.forecast).toBeCloseTo(rBefore.forecast, 9);
    expect(sameDay.todaySales.units).toBeGreaterThanOrEqual(10);

    const closed = await demoStore.closeDay(real, []);
    expect(closed).toMatchObject({ closed: real, businessDate: addDays(real, 1), sampleRows: 0 });
    const after = await computeShopDesk(demoStore, { useAi: false });
    expect(after.businessDate).toBe(addDays(real, 1));
    expect(after.asOf).toBe(real); // yesterday for the shop is now the day that was closed
    expect(after.simulated).toBe(true);
    const rAfter = after.results.get(sugar.id)!;

    // by hand: units sold per day for the 7 days ending on the closed day, from the sales list itself
    const sold = (day: string) => (after.sales.filter((s) => s.itemId === sugar.id && s.date === day)).reduce((a, s) => a + s.qty, 0);
    const lastDays = (n: number, end: string) => Array.from({ length: n }, (_, k) => sold(addDays(end, -k)));
    const m1Hand = lastDays(7, real).reduce((a, b) => a + b, 0) / 7;
    const m1Before = lastDays(7, addDays(real, -1)).reduce((a, b) => a + b, 0) / 7;
    expect(sold(real)).toBe(10);
    expect(member(rBefore, "M1")).toBeCloseTo(m1Before, 9);
    expect(member(rAfter, "M1")).toBeCloseTo(m1Hand, 9); // the 7-day average now includes the 10 sold today
    expect(member(rAfter, "M1")).not.toBeCloseTo(member(rBefore, "M1"), 3);
    const m2Hand = lastDays(28, real).reduce((a, b) => a + b, 0) / 28;
    expect(member(rAfter, "M2")).toBeCloseTo(m2Hand, 9); // and so does the 28-day average
    expect(rAfter.forecast).not.toBeCloseTo(rBefore.forecast, 4);

    // the reorder quantity, by the rule on the "Why this number" screen
    const it = after.items.find((i) => i.id === sugar.id)!;
    expect(it.currentStock).toBe(2);
    const onOrder = after.onOrder[sugar.id] ?? 0;
    const safety = Math.max(it.minSafetyStock, Math.min(rAfter.spread * it.leadTimeDays, SETTINGS.safetyCapDays * rAfter.forecast));
    const reorderPoint = rAfter.forecast * it.leadTimeDays + safety;
    expect(rAfter.decision.status).toBe("Reorder today");
    expect(it.currentStock + onOrder).toBeLessThanOrEqual(reorderPoint);
    const byHand = Math.max(1, Math.ceil(rAfter.forecast * (it.leadTimeDays + it.orderCoverDays) + safety - (it.currentStock + onOrder) - 1e-9));
    expect(rAfter.decision.orderQty).toBe(byHand);
    expect(rAfter.decision.orderQty).not.toBe(rBefore.decision.orderQty); // 10 fewer in stock and a new forecast
  });

  it("closing with the wrong date, or filling a day that already has 5 sales, is refused", async () => {
    const day = (await demoStore.getBusinessDay()).date;
    await expect(demoStore.closeDay(addDays(day, -1), [])).rejects.toThrow(/shop date has changed/);
    const id = raw.items[0].id;
    for (let k = 0; k < 5; k++) await demoStore.addSale(id, 1, "Quick tap");
    await expect(demoStore.closeDay(day, [{ itemId: id, qty: 2 }])).rejects.toThrow(/5 or more sales/);
  });

  it("back to the real date removes the sample sales (and puts the stock back), and keeps the real ones", async () => {
    const start = await demoStore.getBusinessDay();
    expect(start.simulated).toBe(true); // from the test above
    const id = raw.items[1].id;
    const stockBefore = (await demoStore.listItems()).find((i) => i.id === id)!.currentStock;
    // a thin day: close the busy day first, so the shop moves to a new day with no sales yet
    await demoStore.closeDay(start.date, []);
    const day = (await demoStore.getBusinessDay()).date;
    const have = (await demoStore.listSales(day)).filter((s) => s.date === day).length;
    expect(have).toBeLessThan(5);
    await demoStore.closeDay(day, [{ itemId: id, qty: 3 }]);
    expect((await demoStore.listItems()).find((i) => i.id === id)!.currentStock).toBe(Math.max(0, stockBefore - 3));
    const realSalesBefore = (await demoStore.listSales("2000-01-01")).length;
    const r = await demoStore.resetBusinessDate();
    expect(r.removedSampleSales).toBe(1);
    const bd = await demoStore.getBusinessDay();
    expect(bd.simulated).toBe(false);
    expect(bd.date).toBe(todayIST());
    expect((await demoStore.listSales("2000-01-01")).length).toBe(realSalesBefore - 1);
  });
});
