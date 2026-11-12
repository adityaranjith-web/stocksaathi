import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import raw from "./demo-data.json";
import { addDays } from "@/lib/forecast/desk";
import { asOfDay, daysBetween } from "@/lib/dates";
import { computeShopDesk } from "@/lib/desk-service";
import { AccessError } from "./errors";
import type { Store } from "./types";

// ---- stand-ins: the page-request cache, the cookies, and a fake Supabase that counts every call ----
const h = vi.hoisted(() => ({ resets: [] as (() => void)[], calls: [] as string[], fake: null as unknown }));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  // React's cache keeps one answer per page request. Here it keeps one per test (reset in beforeEach).
  const cache = <T extends (...a: never[]) => unknown>(fn: T): T => {
    let has = false; let val: unknown;
    h.resets.push(() => { has = false; val = undefined; });
    return ((...a: never[]) => { if (!has) { val = fn(...a); has = true; } return val; }) as T;
  };
  return { ...actual, cache };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => h.fake }));

// The shop's data, with dates moved so the last sales day is yesterday (as the demo does).
const SHIFT = daysBetween(raw.lastDataDay, asOfDay());
const rawSales = raw.sales.map(([d, id, q]) => ({ date: addDays(d as string, SHIFT), itemId: id as string, qty: q as number }));
const ITEM_ROWS = raw.items.map((i) => ({ id: i.id, distributor_id: i.distributorId, name: i.name, category: i.category, pack: i.pack, price: i.price, current_stock: i.currentStock, lead_time_days: i.leadTimeDays, min_safety_stock: i.minSafetyStock, order_cover_days: i.orderCoverDays }));

/** What the SQL function shop_snapshot() would return for this shop (see 0006_performance.sql). */
function snapshotFor(since: string, withMe = true) {
  const totals = new Map<string, number>();
  for (const s of rawSales) if (s.date >= since) totals.set(`${s.date}|${s.itemId}`, (totals.get(`${s.date}|${s.itemId}`) ?? 0) + s.qty);
  const sales = [...totals].map(([k, q]) => { const [date, id] = k.split("|"); return [id, date, q] as [string, string, number]; }).sort((a, b) => (a[1] + a[0]).localeCompare(b[1] + b[0]));
  return {
    me: withMe ? { id: "u1", shop_id: "S", role: "owner", name: "Owner", is_team: false } : null,
    shop: { id: "S", name: raw.shop.name, locality: raw.shop.locality },
    items: [...ITEM_ROWS].sort((a, b) => a.name.localeCompare(b.name)),
    distributors: raw.distributors.map((d) => ({ id: d.id, name: d.name, supplies: d.supplies, salesman: d.salesman, whatsapp: d.whatsapp, visit_day: d.visitDay })),
    sales,
    calendar: raw.calendar.map((c) => ({ day: c.date, name: c.name, uplift_pct: c.upliftPct })),
    on_order: {}, open_orders: [],
  };
}

const fakeToken = (sub: string) => ["e30", Buffer.from(JSON.stringify({ sub })).toString("base64url"), "sig"].join(".");

function fakeSupabase(opts: { signedIn?: boolean; hasShop?: boolean; claim?: boolean } = {}) {
  const { signedIn = true, hasShop = true, claim = false } = opts;
  let joined = false;
  const note = (s: string) => h.calls.push(s);
  const chain = (table: string, result: unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "order", "range", "insert", "update", "delete", "upsert", "limit"]) b[m] = () => b;
    b.maybeSingle = async () => { note(`rest:${table}`); return { data: result, error: null }; };
    b.single = async () => { note(`rest:${table}`); return { data: result, error: null }; };
    b.then = (resolve: (v: unknown) => unknown) => { note(`rest:${table}`); return resolve({ data: [], error: null }); };
    return b;
  };
  return {
    auth: {
      // the page reads the signed-in person from the cookie: no network call (the middleware has checked it already)
      getSession: async () => ({ data: { session: signedIn ? { access_token: fakeToken("u1") } : null } }),
      getUser: async () => { note("auth:user"); return { data: { user: signedIn ? { id: "u1" } : null } }; },
      signOut: async () => ({}),
    },
    rpc: async (name: string, args: { p_since?: string }) => {
      note(`rpc:${name}`);
      if (name === "shop_snapshot") return { data: snapshotFor(args.p_since!, hasShop || joined), error: null };
      if (name === "daily_sales") return { data: snapshotFor(args.p_since!).sales, error: null };
      if (name === "claim_invite") { joined = claim; return { data: claim, error: null }; }
      return { data: null, error: { message: "unknown " + name } };
    },
    from: (table: string) => chain(table, table === "users" ? { id: "u1", shop_id: "S", role: "owner", name: "Owner", is_team: false } : null),
  };
}

let store: Store;
async function useFake(opts?: Parameters<typeof fakeSupabase>[0]) {
  h.fake = fakeSupabase(opts);
  h.calls.length = 0;
  store = (await import("./supabase")).supabaseStore;
}
beforeEach(() => { h.resets.forEach((r) => r()); h.calls.length = 0; });
const sorted = () => [...h.calls].sort();

describe("a page costs ONE call: the snapshot (the sign-in is read from the cookie)", () => {
  it("Home and Reorder (the Forecast Desk, shop name): 1 call", async () => {
    await useFake();
    await Promise.all([store.getShop(), store.getMe(), computeShopDesk(store)]);
    expect(sorted()).toEqual(["rpc:shop_snapshot"]);
  });
  it("Sell (items and 14 days of sales): 1 call", async () => {
    await useFake();
    await Promise.all([store.getMe(), store.listItems(), store.listSales(addDays(asOfDay(), -13))]);
    expect(sorted()).toEqual(["rpc:shop_snapshot"]);
  });
  it("Deliveries and the set-up lists (open orders, items, distributors, calendar): 1 call", async () => {
    await useFake();
    await Promise.all([store.getMe(), store.openOrders(), store.listItems(), store.listDistributors(), store.listCalendar()]);
    expect(sorted()).toEqual(["rpc:shop_snapshot"]);
  });
  it("Scorecard: the same 1, plus deliveries, orders and the two saved-forecast reads", async () => {
    await useFake();
    await Promise.all([store.getMe(), computeShopDesk(store)]);
    await Promise.all([store.listDeliveries("2026-01-01"), store.listOrders("2026-01-01"), store.listSavedForecasts("2026-01-01")]);
    expect(sorted()).toEqual(["rest:deliveries", "rest:final_forecasts", "rest:model_forecasts", "rest:orders", "rpc:shop_snapshot"]);
  });
  it("asking for sales older than the snapshot costs one more call (daily totals), never raw rows", async () => {
    await useFake();
    const rows = await store.listSales(addDays(asOfDay(), -90));
    expect(sorted()).toEqual(["rpc:daily_sales", "rpc:shop_snapshot"]);
    expect(rows.length).toBeGreaterThan(0);
  });
  it("recording a sale stays light: the user's row and the insert. It does not fetch the snapshot", async () => {
    await useFake();
    await store.addSale("I001", 1, "Quick tap");
    expect(sorted()).toEqual(["rest:sales", "rest:users"]);
  });
});

describe("signed out, no shop, and the invite", () => {
  it("signed out is signed out (not a set-up fault)", async () => {
    await useFake({ signedIn: false });
    await expect(store.getMe()).rejects.toMatchObject({ code: "signed-out" });
    await expect(store.getMe()).rejects.toBeInstanceOf(AccessError);
  });
  it("signed in with no shop and no invite: no-shop", async () => {
    await useFake({ hasShop: false });
    await expect(store.getMe()).rejects.toMatchObject({ code: "no-shop" });
  });
  it("signed in with an invite: joins, and the snapshot is fetched again", async () => {
    await useFake({ hasShop: false, claim: true });
    expect(await store.getMe()).toMatchObject({ role: "owner" });
    expect(sorted()).toEqual(["rpc:claim_invite", "rpc:shop_snapshot", "rpc:shop_snapshot"]);
  });
});

describe("every forecast and reorder quantity is identical to before", () => {
  // "Before" = the Forecast Desk fed the raw sales rows (one row per tap). "After" = the Desk fed the daily totals
  // that the snapshot returns. They must match exactly: forecasts, weights, spreads, confidence and orders.
  const rawStore = {
    listItems: async () => ITEM_ROWS.map((r) => ({ id: r.id, name: r.name, category: r.category, pack: r.pack, price: r.price, distributorId: r.distributor_id, leadTimeDays: r.lead_time_days, minSafetyStock: r.min_safety_stock, orderCoverDays: r.order_cover_days, currentStock: r.current_stock })).sort((a, b) => a.name.localeCompare(b.name)),
    listDistributors: async () => [],
    listSales: async (since: string) => rawSales.filter((s) => s.date >= since),
    listCalendar: async () => raw.calendar,
    openOrderQty: async () => ({}),
    listAiForecasts: async () => [],
  } as unknown as Store;

  it("all 30 items: same forecast, same weights, same decision, same order quantity", async () => {
    await useFake();
    const before = await computeShopDesk(rawStore);
    const after = await computeShopDesk(store);
    expect([...after.results.keys()].sort()).toEqual([...before.results.keys()].sort());
    let checked = 0, orders = 0;
    for (const [id, b] of before.results) {
      expect(after.results.get(id), id).toEqual(b);
      checked++; if (b.decision.orderQty > 0) orders++;
    }
    expect(checked).toBe(30);
    expect(orders).toBeGreaterThan(0); // the comparison really covered reorder quantities
    expect(after.todaySales).toEqual(before.todaySales);
    expect(after.asOf).toBe(before.asOf);
  });

  it("the daily totals hold exactly the same units as the raw rows", async () => {
    await useFake();
    const since = addDays(asOfDay(), -55);
    const totals = await store.listSales(since);
    const units = (xs: { qty: number }[]) => xs.reduce((a, s) => a + s.qty, 0);
    expect(units(totals)).toBe(units(rawSales.filter((s) => s.date >= since)));
    expect(totals.length).toBeLessThanOrEqual(rawSales.length); // fewer entries to send, same units
  });
});

describe("speed settings stay in place", () => {
  const ROOT = path.resolve(import.meta.dirname, "../..");
  const files = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = path.join(d, n); return statSync(p).isDirectory() ? (n === "node_modules" || n === ".next" ? [] : files(p)) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
  const source = ["app", "components", "lib"].flatMap((d) => files(path.join(ROOT, d))).filter((p) => !/\.test\.tsx?$/.test(p));

  it("no query uses select(\"*\"): each screen asks only for the columns it uses", () => {
    const bad = source.filter((p) => /\.select\(\s*["'`]\*["'`]\s*\)/.test(readFileSync(p, "utf8"))).map((p) => path.relative(ROOT, p));
    expect(bad).toEqual([]);
  });
  it("the Vercel functions run in Seoul (icn1), next to the Supabase project in ap-northeast-2, and the nightly cron is kept", () => {
    const v = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
    expect(v.regions).toEqual(["icn1"]);
    expect(v.crons).toEqual([{ path: "/api/cron/nightly", schedule: "30 20 * * *" }]);
    expect(v.framework).toBe("nextjs");
  });
  it("the sales are never read as raw rows page by page any more", () => {
    const store = readFileSync(path.join(ROOT, "lib/data/supabase.ts"), "utf8");
    expect(store).not.toMatch(/from\("sales"\)\s*\.select\(/);
    expect(store).toMatch(/shop_snapshot/);
  });
});
