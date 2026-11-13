import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { addDays } from "@/lib/forecast/desk";
import { todayIST } from "@/lib/dates";
import { computeShopDesk } from "@/lib/desk-service";
import { demoStore } from "@/lib/data/demo";
import { COLD_START_LABEL } from "./cold-start";
import { checkStarterItems, checkStartHistory, checkStartNumbers, MAX_START_ITEMS, showStartCard, START_COPY, STARTER_ITEMS, startSteps } from "./start-shop";

const ROOT = path.resolve(import.meta.dirname, "..");
const src = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const input = (items: number, itemsWithoutEstimate: number, salesCount: number) => ({ items, itemsWithoutEstimate, salesCount });

describe("the ready list of common items", () => {
  it("has about 40 items, each with a name and a typical unit, and no name twice", () => {
    expect(STARTER_ITEMS.length).toBeGreaterThanOrEqual(40);
    expect(STARTER_ITEMS.length).toBeLessThanOrEqual(50);
    expect(new Set(STARTER_ITEMS.map((i) => i.name.toLowerCase())).size).toBe(STARTER_ITEMS.length);
    for (const i of STARTER_ITEMS) { expect(i.name.length, i.name).toBeGreaterThanOrEqual(2); expect(i.pack.trim(), i.name).not.toBe(""); }
  });
  it("includes the everyday items the owner named", () => {
    const names = STARTER_ITEMS.map((i) => i.name.toLowerCase()).join("|");
    for (const w of ["milk", "sugar", "atta", "rice", "toor dal", "oil", "salt", "tea", "biscuits", "soap"]) expect(names, w).toContain(w);
  });
});

describe("when the Start your shop card shows on Home", () => {
  it("fewer than 3 items: always", () => {
    for (const n of [0, 1, 2]) expect(showStartCard(input(n, n, 0)), `${n} items`).toBe(true);
    expect(showStartCard(input(2, 0, 500))).toBe(true); // even with estimates and sales: the rule is the item count
  });
  it("3 or more items with sales (the demo shop and every existing shop): never, so Home looks exactly as before", () => {
    expect(showStartCard(input(30, 0, 800))).toBe(false); // the demo shop
    expect(showStartCard(input(30, 30, 800))).toBe(false); // existing shop: no estimates at all, but it has sales
    expect(showStartCard(input(3, 3, 1))).toBe(false);
    expect(showStartCard(input(3, 0, 0))).toBe(false);
  });
  it("a new shop in the middle of the guide (items added, numbers not done, nothing sold) still sees it, so it is not left on empty panels", () => {
    expect(showStartCard(input(40, 40, 0))).toBe(true);
    expect(showStartCard(input(5, 2, 0))).toBe(true);
  });
  it("it goes away once the numbers are done", () => {
    expect(showStartCard(input(40, 0, 0))).toBe(false);
  });
  it("the ticks: items, numbers, then past sales (optional)", () => {
    expect(startSteps(input(0, 0, 0))).toEqual({ addItems: false, numbers: false, history: false });
    expect(startSteps(input(40, 40, 0))).toEqual({ addItems: true, numbers: false, history: false });
    expect(startSteps(input(40, 10, 0))).toEqual({ addItems: true, numbers: false, history: false });
    expect(startSteps(input(40, 0, 0))).toEqual({ addItems: true, numbers: true, history: false });
    expect(startSteps(input(40, 0, 12))).toEqual({ addItems: true, numbers: true, history: true });
  });
  it("Home shows the card instead of the normal panels, and uses this rule", () => {
    const home = src("app/page.tsx");
    expect(home).toContain("showStartCard(start)");
    expect(home).toContain("<StartYourShop");
    expect(home.indexOf("showStartCard(start)")).toBeLessThan(home.indexOf("<DotLabel>Reorder today</DotLabel>")); // it returns before the normal panels
  });
});

describe("what the owner types is checked", () => {
  it("step 1: blanks dropped, repeated names kept once, nothing ticked is an error", () => {
    const ok = checkStarterItems({ items: [{ name: " Sugar ", pack: "1 kg" }, { name: "sugar", pack: "2 kg" }, { name: "", pack: "x" }, { name: "Tea  Powder", pack: "250 g" }] });
    expect(ok).toEqual({ ok: true, value: [{ name: "Sugar", pack: "1 kg" }, { name: "Tea Powder", pack: "250 g" }] });
    expect(checkStarterItems({ items: [] }).ok).toBe(false);
    expect(checkStarterItems(null).ok).toBe(false);
    expect(checkStarterItems({ items: [{ name: "A" }] }).ok).toBe(false);
    expect(checkStarterItems({ items: Array.from({ length: MAX_START_ITEMS + 1 }, (_, i) => ({ name: `Item ${i}`, pack: "" })) }).ok).toBe(false);
  });
  it("step 2: both numbers per item, lead time 2 when empty, a half-filled row is a mistake, an empty row is skipped", () => {
    const ok = checkStartNumbers({ distributorName: " Ravi Traders ", rows: [{ itemId: "a", perDay: "8", stock: "20" }, { itemId: "b", perDay: "", stock: "" }, { itemId: "c", perDay: "2.5", stock: "0", price: "45.5" }] });
    expect(ok).toEqual({ ok: true, value: { distributorName: "Ravi Traders", leadTimeDays: 2, rows: [{ itemId: "a", perDay: 8, stock: 20, price: null }, { itemId: "c", perDay: 2.5, stock: 0, price: 45.5 }] } });
    expect(checkStartNumbers({ rows: [{ itemId: "a", perDay: "8", stock: "" }] }).ok).toBe(false);
    expect(checkStartNumbers({ rows: [{ itemId: "a", perDay: "-1", stock: "5" }] }).ok).toBe(false);
    expect(checkStartNumbers({ rows: [{ itemId: "a", perDay: "3", stock: "1.5" }] }).ok).toBe(false); // stock is a whole number
    expect(checkStartNumbers({ rows: [{ itemId: "a", perDay: "3", stock: "4" }], leadTimeDays: "99" }).ok).toBe(false);
    expect(checkStartNumbers({ rows: [{ itemId: "a", perDay: "3", stock: "4" }], leadTimeDays: "5" })).toMatchObject({ ok: true, value: { leadTimeDays: 5 } });
    expect(checkStartNumbers({ rows: [{ itemId: "a", perDay: "", stock: "" }] }).ok).toBe(false); // nothing filled in at all
    expect(checkStartNumbers({ rows: [{ itemId: "a", perDay: "3", stock: "4", price: "abc" }] }).ok).toBe(false);
  });
  it("step 3: only the last 7 days, whole numbers, empty and 0 skipped", () => {
    const range = { from: "2026-11-06", to: "2026-11-12" };
    expect(checkStartHistory({ rows: [{ itemId: "a", date: "2026-11-12", qty: "5" }, { itemId: "a", date: "2026-11-11", qty: "" }, { itemId: "a", date: "2026-11-10", qty: "0" }] }, range))
      .toEqual({ ok: true, value: [{ itemId: "a", date: "2026-11-12", qty: 5 }] });
    expect(checkStartHistory({ rows: [{ itemId: "a", date: "2026-11-01", qty: "5" }] }, range).ok).toBe(false);
    expect(checkStartHistory({ rows: [{ itemId: "a", date: "2026-11-13", qty: "5" }] }, range).ok).toBe(false);
    expect(checkStartHistory({ rows: [{ itemId: "a", date: "2026-11-12", qty: "2.5" }] }, range).ok).toBe(false);
    expect(checkStartHistory({ rows: [] }, range).ok).toBe(false);
  });
});

describe("plain, short English on the new screens (CLAUDE.md rule 5)", () => {
  const lines = [START_COPY.cardLine, ...START_COPY.steps.flatMap((s) => [s.title, s.text, s.button]), START_COPY.items.help, START_COPY.numbers.help, START_COPY.history.help, COLD_START_LABEL];
  it("every sentence is 14 words or fewer", () => {
    for (const t of lines) for (const s of t.split(/(?<=[.?!])\s+/).filter(Boolean)) expect(s.trim().split(/\s+/).length, s).toBeLessThanOrEqual(14);
  });
  it("has the three steps in order, and the last one is optional", () => {
    expect(START_COPY.steps.map((s) => s.href)).toEqual(["/start/items", "/start/numbers", "/start/history"]);
    expect(START_COPY.steps[2].title).toContain("optional");
    expect(START_COPY.cardTitle).toBe("Start your shop");
  });
});

describe("the steps work (the same code the demo runs)", () => {
  it("add items, give the numbers, add past sales, and the new items get a forecast at once", async () => {
    const before = await computeShopDesk(demoStore, { useAi: false });
    const beforeResults = new Map([...before.results].map(([id, r]) => [id, JSON.stringify(r)]));

    const added = await demoStore.addStarterItems([{ name: "Start Test Milk", pack: "500 ml" }, { name: "Start Test Sugar", pack: "1 kg" }, { name: "sugar", pack: "1 kg" }]);
    expect(added.added).toBe(2);
    expect(added.skipped).toEqual(["sugar"]); // the demo shop already has Sugar
    const items = await demoStore.listItems();
    const milk = items.find((i) => i.name === "Start Test Milk")!;
    const sugar = items.find((i) => i.name === "Start Test Sugar")!;
    expect(milk).toMatchObject({ currentStock: 0, pack: "500 ml", estimatedPerDay: null, leadTimeDays: 2 });
    expect((await demoStore.listDistributors()).some((d) => d.id === milk.distributorId)).toBe(true); // it has a distributor, so it can be on the reorder list

    const saved = await demoStore.saveStartNumbers({ distributorName: "", leadTimeDays: 3, rows: [{ itemId: milk.id, perDay: 12, stock: 10, price: 28 }, { itemId: sugar.id, perDay: 4, stock: 500, price: null }] });
    expect(saved.saved).toBe(2);
    const after = await computeShopDesk(demoStore, { useAi: false });
    const m = after.results.get(milk.id)!;
    expect(after.coldStart.get(milk.id)).toMatchObject({ estimate: 12, daysOfData: 0, forecast: 12, weightReal: 0 });
    expect(m.forecast).toBe(12);
    expect(m.confidence).toBe("Low");
    expect(m.decision.status).toBe("Reorder today"); // 10 in the shop, 12 a day, lead time 3
    // By hand: safety 2; reorder point 12 x 3 + 2 = 38 >= 10. Order = 12 x (3 + 7) + 2 - 10 = 112.
    expect(m.decision.orderQty).toBe(112);
    expect(after.results.get(sugar.id)!.decision.status).toBe("Don't reorder"); // 500 in stock = 125 days: more than the limit

    // past sales: 7 days of 12 a day. Stock stays as typed (10): the sales already happened.
    const last = addDays(todayIST(), -1);
    const rows = Array.from({ length: 7 }, (_, k) => ({ itemId: milk.id, date: addDays(last, -k), qty: 12 }));
    expect((await demoStore.saveStartHistory(rows)).saved).toBe(7);
    expect((await demoStore.listItems()).find((i) => i.id === milk.id)!.currentStock).toBe(10);
    const later = await computeShopDesk(demoStore, { useAi: false });
    expect(later.coldStart.get(milk.id)).toMatchObject({ daysOfData: 7, weightReal: 0.5, realAvg: 12, forecast: 12 });

    // every other item is untouched
    for (const [id, json] of beforeResults) expect(JSON.stringify(later.results.get(id)), id).toBe(json);
  });
});

describe("only the owner, and nothing else changes", () => {
  it("every Start screen and route needs the owner", () => {
    for (const p of ["app/start/items/page.tsx", "app/start/numbers/page.tsx", "app/start/history/page.tsx"]) expect(src(p), p).toContain("requireOwner()");
    for (const p of ["app/api/start/items/route.ts", "app/api/start/numbers/route.ts", "app/api/start/history/route.ts"]) expect(src(p), p).toContain("ownerOnly()");
  });
  it("the demo is as before unless DEMO_NEW_SHOP=1 is set", () => {
    const demo = src("lib/data/demo.ts");
    expect(demo).toContain('process.env.DEMO_NEW_SHOP === "1"');
    expect(demo).toMatch(/items: fresh \? \[\] : raw\.items/);
  });
  it("the Forecast Desk file is not touched by this change (the cold start lives in lib/cold-start.ts)", () => {
    expect(src("lib/cold-start.ts")).toContain("applyColdStart");
    expect(src("lib/forecast/desk.ts")).not.toMatch(/applyColdStart|COLD_START|cold-start/);
  });
});
