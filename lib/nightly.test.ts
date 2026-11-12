import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/forecast/desk";
import { asOfDay } from "@/lib/dates";
import { computeShopDesk } from "@/lib/desk-service";
import { buildForecastRows, runNightly, type NightlyDb, type NightlyRows, type ShopData } from "./nightly";
import { handleNightly, isAuthorized } from "./server/nightly-handler";
import type { Item, Store } from "@/lib/data/types";

const RUN = asOfDay();
const item = (id: string, over: Partial<Item> = {}): Item => ({ id, name: `Item ${id}`, category: "T", pack: "1", price: 10, distributorId: "D", leadTimeDays: 2, minSafetyStock: 2, orderCoverDays: 7, currentStock: 30, ...over });

// Item A sells 8 to 12 a day for 56 days. Item N is new: 5 days of sales only.
const sales = [
  ...Array.from({ length: 56 }, (_, k) => ({ date: addDays(RUN, -k), itemId: "A", qty: 8 + (k % 5) })),
  ...Array.from({ length: 5 }, (_, k) => ({ date: addDays(RUN, -k), itemId: "N", qty: 3 })),
];
const shopData = (over: Partial<ShopData> = {}): ShopData => ({ items: [item("A"), item("N", { leadTimeDays: 1, orderCoverDays: 1 })], sales, calendar: [], onOrder: {}, ...over });

function fakeDb(shops: Record<string, ShopData | Error>) {
  const saved: { shop: string; rows: NightlyRows }[] = [];
  let current = "";
  const db: NightlyDb = {
    listShopIds: async () => Object.keys(shops),
    loadShop: async (id) => { current = id; const s = shops[id]; if (s instanceof Error) throw s; return s; },
    saveRows: async (rows) => { saved.push({ shop: current, rows }); },
  };
  return { db, saved };
}

afterEach(() => vi.restoreAllMocks());

describe("what the nightly job saves for one shop", () => {
  const data = shopData();
  const store = {
    listItems: async () => data.items, listDistributors: async () => [], listSales: async () => data.sales, listCalendar: async () => [], openOrderQty: async () => ({}),
    listAiForecasts: async () => [],
  } as unknown as Store;

  it("saves 5 model forecasts, 5 scores and 1 final forecast for a normal item", async () => {
    const { db, saved } = fakeDb({ S1: data });
    await runNightly(db, RUN);
    const rows = saved[0].rows;
    expect(rows.modelForecasts.filter((r) => r.item_id === "A").map((r) => r.model).sort()).toEqual(["M1", "M2", "M3", "M4", "M5"]);
    expect(rows.modelScores.filter((r) => r.item_id === "A")).toHaveLength(5);
    expect(rows.finalForecasts.filter((r) => r.item_id === "A")).toHaveLength(1);
  });

  it("the weights saved for an item add up to 100%", async () => {
    const { db, saved } = fakeDb({ S1: data });
    await runNightly(db, RUN);
    const w = saved[0].rows.modelScores.filter((r) => r.item_id === "A").reduce((a, r) => a + r.weight, 0);
    expect(w).toBeCloseTo(1, 3);
  });

  it("a new item has only the plain 28-day average (M2), with Low confidence (BR5)", async () => {
    const { db, saved } = fakeDb({ S1: data });
    await runNightly(db, RUN);
    const rows = saved[0].rows;
    expect(rows.modelForecasts.filter((r) => r.item_id === "N").map((r) => r.model)).toEqual(["M2"]);
    expect(rows.finalForecasts.find((r) => r.item_id === "N")).toMatchObject({ confidence: "Low" });
  });

  it("the final forecast says how many days it covers: lead time + order cover", async () => {
    const { db, saved } = fakeDb({ S1: data });
    await runNightly(db, RUN);
    const f = saved[0].rows.finalForecasts;
    expect(f.find((r) => r.item_id === "A")!.horizon_days).toBe(9);
    expect(f.find((r) => r.item_id === "N")!.horizon_days).toBe(2);
  });

  it("saves the same forecast and order quantity that the reorder list shows", async () => {
    const { db, saved } = fakeDb({ S1: data });
    await runNightly(db, RUN);
    const screen = (await computeShopDesk(store, { useAi: false })).results.get("A")!;
    const row = saved[0].rows.finalForecasts.find((r) => r.item_id === "A")!;
    expect(row.units_per_day).toBeCloseTo(screen.forecast, 3);
    expect(row.order_qty).toBe(screen.decision.orderQty);
    expect(row.status).toBe(screen.decision.status);
    expect(row.run_date).toBe(RUN);
  });

  it("saves nothing for an item the Desk did not run on", () => {
    expect(buildForecastRows("S1", RUN, data.items, new Map())).toEqual({ modelForecasts: [], modelScores: [], finalForecasts: [] });
  });

  it("numbers fit the table columns (3 decimals; weight 4) and no row repeats a key", async () => {
    const { db, saved } = fakeDb({ S1: data });
    await runNightly(db, RUN);
    const r = saved[0].rows;
    const decimals = (x: number, d: number) => Math.abs(x * 10 ** d - Math.round(x * 10 ** d)) < 1e-6;
    for (const m of r.modelForecasts) expect(decimals(m.units_per_day, 3)).toBe(true);
    for (const m of r.modelScores) { expect(decimals(m.error_14d, 3)).toBe(true); expect(decimals(m.weight, 4)).toBe(true); }
    const keys = r.modelForecasts.map((m) => `${m.item_id}|${m.run_date}|${m.model}`);
    expect(new Set(keys).size).toBe(keys.length); // saving twice the same night replaces rows, it cannot double them
    const fkeys = r.finalForecasts.map((m) => `${m.item_id}|${m.run_date}`);
    expect(new Set(fkeys).size).toBe(fkeys.length);
  });
});

describe("running for every shop", () => {
  it("covers all shops and counts them", async () => {
    const { db, saved } = fakeDb({ S1: shopData(), S2: shopData() });
    const s = await runNightly(db, RUN);
    expect(s).toMatchObject({ runDate: RUN, shops: 2, failedShops: 0, skippedShops: 0, items: 4 });
    expect(saved.map((x) => x.shop)).toEqual(["S1", "S2"]);
    expect(saved[0].rows.finalForecasts.every((r) => r.shop_id === "S1")).toBe(true);
    expect(saved[1].rows.finalForecasts.every((r) => r.shop_id === "S2")).toBe(true);
  });

  it("one shop failing does not stop the others", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, saved } = fakeDb({ S1: new Error("database is down"), S2: shopData() });
    const s = await runNightly(db, RUN);
    expect(s).toMatchObject({ shops: 1, failedShops: 1 });
    expect(saved.map((x) => x.shop)).toEqual(["S2"]);
    expect(log).toHaveBeenCalledOnce();
  });

  it("skips a shop with no items", async () => {
    const { db, saved } = fakeDb({ S1: shopData({ items: [] }) });
    expect(await runNightly(db, RUN)).toMatchObject({ shops: 0, skippedShops: 1 });
    expect(saved).toHaveLength(0);
  });
});

describe("the secret on the nightly route", () => {
  const SECRET = "test-secret-0123456789abcdef";
  const req = (auth?: string) => new Request("https://x.test/api/cron/nightly", { headers: auth ? { authorization: auth } : {} });
  const make = (shops = { S1: shopData() }) => { const f = fakeDb(shops); return { ...f, makeDb: vi.fn(() => f.db) }; };

  it("isAuthorized accepts only the exact Bearer secret", () => {
    expect(isAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isAuthorized(SECRET, SECRET)).toBe(false); // no "Bearer "
    expect(isAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isAuthorized(`bearer ${SECRET}`, SECRET)).toBe(false);
    expect(isAuthorized(null, SECRET)).toBe(false);
    expect(isAuthorized("Bearer ", "")).toBe(false);
    expect(isAuthorized(`Bearer short`, "short")).toBe(false); // too short to trust
  });

  it("stays shut when CRON_SECRET is missing or too short (503) and never touches the database", async () => {
    const m = make();
    expect((await handleNightly(req(`Bearer ${SECRET}`), { secret: undefined, makeDb: m.makeDb })).status).toBe(503);
    expect((await handleNightly(req("Bearer abc"), { secret: "abc", makeDb: m.makeDb })).status).toBe(503);
    expect(m.makeDb).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong secret (401) and never touches the database", async () => {
    const m = make();
    expect((await handleNightly(req(), { secret: SECRET, makeDb: m.makeDb })).status).toBe(401);
    expect((await handleNightly(req("Bearer wrong-wrong-wrong-wrong"), { secret: SECRET, makeDb: m.makeDb })).status).toBe(401);
    expect(m.makeDb).not.toHaveBeenCalled();
    expect(m.saved).toHaveLength(0);
  });

  it("runs the job with the right secret (200)", async () => {
    const m = make();
    const res = await handleNightly(req(`Bearer ${SECRET}`), { secret: SECRET, makeDb: m.makeDb, runDate: RUN });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ ok: true, runDate: RUN, shops: 1, items: 2 });
    expect(m.saved).toHaveLength(1);
  });

  it("answers 503 with a plain message when the database settings are missing, without leaking the secret", async () => {
    const res = await handleNightly(req(`Bearer ${SECRET}`), { secret: SECRET, makeDb: () => { throw new Error("The nightly job needs SUPABASE_SERVICE_ROLE_KEY."); } });
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(text).not.toContain(SECRET);
  });

  it("answers 500 when a shop failed, so the problem shows in the Vercel log", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const m = make({ S1: new Error("boom") } as unknown as { S1: ShopData });
    const res = await handleNightly(req(`Bearer ${SECRET}`), { secret: SECRET, makeDb: m.makeDb, runDate: RUN });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, failedShops: 1 });
  });
});
