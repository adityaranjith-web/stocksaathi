import { realBusinessDay } from "@/lib/test-helpers";
import { afterEach, describe, expect, it, vi } from "vitest";
import raw from "@/lib/data/demo-data.json";
import { addDays, runDesk } from "@/lib/forecast/desk";
import { asOfDay } from "@/lib/dates";
import { buildSeries, computeShopDesk, runShopDesk } from "@/lib/desk-service";
import { runNightly, type NightlyDb, type NightlyRows, type ShopData } from "@/lib/nightly";
import { buildAiRequest } from "./payload";
import { GEMINI_BASE_URL, GEMINI_DEFAULT_MODEL, geminiForecaster, parseGeminiAnswers } from "./providers";
import { getForecaster } from "./registry";
import { collectAiForecasts } from "./run";
import { runShadow } from "./shadow";
import { AiUnavailableError, type AiForecastRequest, type AiForecastResult, type Forecaster } from "./types";
import type { AiForecastRow, Item, Store } from "@/lib/data/types";

const KEY = "AIza-test-key-0123456789";
const RUN = asOfDay();
const item = (id: string, over: Partial<Item> = {}): Item => ({ id, name: `Item ${id}`, category: "T", pack: "1", price: 10, distributorId: "D", leadTimeDays: 2, minSafetyStock: 2, orderCoverDays: 7, currentStock: 30, ...over });
const ids = (n: number) => Array.from({ length: n }, (_, i) => `I${String(i + 1).padStart(3, "0")}`);
const items = (n: number) => ids(n).map((id) => item(id));
const sales = (list: Item[]) => list.flatMap((it) => Array.from({ length: 56 }, (_, k) => ({ date: addDays(RUN, -k), itemId: it.id, qty: 8 + (k % 5) })));

/** A Gemini reply that answers every item id found in the request it was sent. */
function geminiReply(requestBody: string, per: (id: string) => object | null = (id) => ({ itemId: id, unitsPerDay: 10, low: 8, high: 12, note: "Steady sales." })) {
  const sent = JSON.parse(requestBody).contents[0].parts[0].text;
  const list = (JSON.parse(sent).items as AiForecastRequest[]).map((r) => per(r.item.id)).filter(Boolean);
  return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(list) }] } }] });
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Gemini settings", () => {
  const on = { AI_MODE: "shadow", AI_FORECASTER: "gemini" };
  it("needs a key, and stays off without one", () => {
    expect(getForecaster({ ...on })).toBeNull();
    expect(getForecaster({ ...on, AI_FORECAST_KEY: "  " })).toBeNull();
    expect(getForecaster({ ...on, AI_FORECAST_KEY: KEY })?.id).toBe("gemini");
  });
  it("is off when AI_MODE is off, even with a key", () => {
    expect(getForecaster({ AI_FORECASTER: "gemini", AI_FORECAST_KEY: KEY })).toBeNull();
  });
  it("uses the default model unless AI_GEMINI_MODEL names one; refuses odd model names", () => {
    expect(getForecaster({ ...on, AI_FORECAST_KEY: KEY })!.name).toContain(GEMINI_DEFAULT_MODEL);
    expect(getForecaster({ ...on, AI_FORECAST_KEY: KEY, AI_GEMINI_MODEL: "gemini-3.8-flash" })!.name).toContain("gemini-3.8-flash");
    expect(getForecaster({ ...on, AI_FORECAST_KEY: KEY, AI_GEMINI_MODEL: "../evil?x=1" })).toBeNull();
  });
  it("the key is not in the name shown on screen", () => {
    expect(getForecaster({ ...on, AI_FORECAST_KEY: KEY })!.name).not.toContain(KEY);
  });
});

describe("the Gemini call", () => {
  const req = (id: string): AiForecastRequest => {
    const it = item(id);
    const series = buildSeries(id, sales([it]), RUN);
    const input = { itemId: id, leadTimeDays: 2, minSafetyStock: 2, orderCoverDays: 7, currentStock: 30, onOrder: 0 };
    return buildAiRequest({ item: it, input, result: runDesk(input, series, []), series, calendar: [], asOf: RUN, horizonDays: 9 });
  };

  it("sends the key in a header, never in the address, and asks for JSON", async () => {
    const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => geminiReply(String(init!.body)));
    const out = await geminiForecaster(KEY, "gemini-test-model", 5000, f as unknown as typeof fetch).forecastMany!([req("I001"), req("I002")]);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe(`${GEMINI_BASE_URL}/gemini-test-model:generateContent`);
    expect(String(url)).not.toContain(KEY);
    expect((init!.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    expect(String(init!.body)).not.toContain(KEY);
    expect(JSON.parse(String(init!.body)).generationConfig.responseMimeType).toBe("application/json");
    expect(out.get("I001")).toEqual({ unitsPerDay: 10, low: 8, high: 12, note: "Steady sales." });
    expect(out.size).toBe(2);
  });

  it("sends only what docs/ai-integration.md allows: no shop, owner, helper, distributor or phone number", async () => {
    let body = "";
    const f = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => { body = String(init!.body); return geminiReply(body); });
    const real = raw.items.slice(0, 12).map((i) => ({ ...i }));
    const reqs = real.map((it) => {
      const series = buildSeries(it.id, raw.sales.map(([date, itemId, qty]) => ({ date: date as string, itemId: itemId as string, qty: qty as number })), raw.lastDataDay);
      const input = { itemId: it.id, leadTimeDays: it.leadTimeDays, minSafetyStock: it.minSafetyStock, orderCoverDays: it.orderCoverDays, currentStock: it.currentStock, onOrder: 0 };
      return buildAiRequest({ item: it, input, result: runDesk(input, series, raw.calendar), series, calendar: raw.calendar, asOf: raw.lastDataDay, horizonDays: 9 });
    });
    await geminiForecaster(KEY, undefined, 5000, f as unknown as typeof fetch).forecastMany!(reqs);
    expect(body).not.toContain(raw.shop.name);
    expect(body).not.toContain(raw.shop.locality);
    for (const d of raw.distributors) { expect(body).not.toContain(d.salesman); expect(body).not.toContain(d.whatsapp); expect(body).not.toContain(d.name); }
    for (const u of raw.users) expect(body).not.toContain(u.name);
    expect(body).not.toContain(KEY);
    for (const r of reqs) expect(Object.keys(r)).toEqual(["asOf", "horizonDays", "item", "salesDaily", "calendar", "desk"]);
  });

  it("a 429 means the free limit is used up", async () => {
    const f = vi.fn(async () => new Response("quota", { status: 429 }));
    await expect(geminiForecaster(KEY, undefined, 5000, f as unknown as typeof fetch).forecastMany!([req("I001")])).rejects.toMatchObject({ name: "AiUnavailableError", reason: "limit" });
  });
  it("a server error, a refused key and an unreachable service are all 'not available'", async () => {
    for (const status of [500, 503, 403, 400]) {
      const f = vi.fn(async () => new Response("no", { status }));
      await expect(geminiForecaster(KEY, undefined, 5000, f as unknown as typeof fetch).forecastMany!([req("I001")])).rejects.toMatchObject({ reason: "error" });
    }
    const down = vi.fn(async () => { throw new TypeError("fetch failed"); });
    await expect(geminiForecaster(KEY, undefined, 5000, down as unknown as typeof fetch).forecastMany!([req("I001")])).rejects.toBeInstanceOf(AiUnavailableError);
  });
  it("error messages never contain the key", async () => {
    const f = vi.fn(async () => new Response(`bad key ${KEY}`, { status: 403 }));
    const e = await geminiForecaster(KEY, undefined, 5000, f as unknown as typeof fetch).forecastMany!([req("I001")]).catch((x: Error) => x);
    expect((e as Error).message).not.toContain(KEY);
  });
  it("text that is not JSON is 'not available', not a crash", async () => {
    const f = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: "Sorry, I cannot help." }] } }] }));
    await expect(geminiForecaster(KEY, undefined, 5000, f as unknown as typeof fetch).forecastMany!([req("I001")])).rejects.toMatchObject({ reason: "error" });
  });
  it("one item at a time also works (forecast)", async () => {
    const f = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => geminiReply(String(init!.body)));
    expect((await geminiForecaster(KEY, undefined, 5000, f as unknown as typeof fetch).forecast(req("I007"))).unitsPerDay).toBe(10);
  });
  it("leaves out answers that are not usable and answers for items that were not asked", () => {
    const body = { candidates: [{ content: { parts: [{ text: JSON.stringify([{ itemId: "A", unitsPerDay: 5 }, { itemId: "B", unitsPerDay: -3 }, { itemId: "C", unitsPerDay: "x" }, { unitsPerDay: 4 }, { itemId: "A", unitsPerDay: 99 }]) }] } }] };
    const m = parseGeminiAnswers(body);
    expect([...m.keys()]).toEqual(["A"]);
    expect(m.get("A")!.unitsPerDay).toBe(5);
  });
});

describe("asking the AI for a whole shop", () => {
  const list = items(25);
  const data = { items: list, sales: sales(list), calendar: [], onOrder: {} };
  const results = runShopDesk({ asOf: RUN, ...data });
  const args = { items: list, results, sales: data.sales, calendar: [], onOrder: {}, asOf: RUN, runDate: RUN };
  const answer = (): AiForecastResult => ({ unitsPerDay: 9, low: 7, high: 11 });
  const fake = (many: (r: AiForecastRequest[]) => Promise<Map<string, AiForecastResult>>): Forecaster => ({ id: "gemini", name: "Fake", forecast: async () => answer(), forecastMany: many });
  const all = async (r: AiForecastRequest[]) => new Map(r.map((x) => [x.item.id, answer()]));

  it("25 items are asked in 3 calls, not 25 (keeps the free limit safe)", async () => {
    const many = vi.fn(all);
    const got = await collectAiForecasts({ ...args, forecaster: fake(many) });
    expect(many).toHaveBeenCalledTimes(3);
    expect(got).toMatchObject({ failed: 0, stopped: null });
    expect(got.rows).toHaveLength(25);
    expect(got.rows[0]).toMatchObject({ runDate: RUN, provider: "gemini", aiUnitsPerDay: 9, low: 7, high: 11, horizonDays: 9 });
  });
  it("the saved Forecast Desk figure is the Desk's own, for a fair comparison", async () => {
    const got = await collectAiForecasts({ ...args, forecaster: fake(all) });
    for (const row of got.rows) expect(row.blendUnitsPerDay).toBe(results.get(row.itemId)!.forecast);
  });
  it("when the free limit is reached it stops asking, keeps what it has, and does not throw", async () => {
    let calls = 0;
    const many = vi.fn(async (r: AiForecastRequest[]) => { if (++calls === 2) throw new AiUnavailableError("limit", "limit"); return all(r); });
    const got = await collectAiForecasts({ ...args, forecaster: fake(many) });
    expect(many).toHaveBeenCalledTimes(2); // the third call is never made
    expect(got.stopped).toBe("limit");
    expect(got.rows).toHaveLength(10);
    expect(got.failed).toBe(15);
  });
  it("stops after two failed calls in a row (the service is down)", async () => {
    const many = vi.fn(async () => { throw new AiUnavailableError("down", "error"); });
    const got = await collectAiForecasts({ ...args, forecaster: fake(many), batchSize: 5 });
    expect(many).toHaveBeenCalledTimes(2);
    expect(got).toMatchObject({ stopped: "error", failed: 25 });
    expect(got.rows).toHaveLength(0);
  });
  it("one failed call is not the end: the next one is still tried", async () => {
    let calls = 0;
    const many = vi.fn(async (r: AiForecastRequest[]) => { if (++calls === 1) throw new AiUnavailableError("blip", "error"); return all(r); });
    const got = await collectAiForecasts({ ...args, forecaster: fake(many) });
    expect(many).toHaveBeenCalledTimes(3);
    expect(got.rows).toHaveLength(15);
    expect(got.failed).toBe(10);
    expect(got.stopped).toBeNull();
  });
  it("an item the AI skipped is counted, the others are kept", async () => {
    const many = async (r: AiForecastRequest[]) => new Map(r.filter((x) => x.item.id !== "I003").map((x) => [x.item.id, answer()]));
    const got = await collectAiForecasts({ ...args, forecaster: fake(many) });
    expect(got.rows).toHaveLength(24);
    expect(got.failed).toBe(1);
  });
  it("stops when the time is up", async () => {
    let t = 0;
    const many = vi.fn(async (r: AiForecastRequest[]) => { t += 30; return all(r); });
    const got = await collectAiForecasts({ ...args, forecaster: fake(many), deadline: 50, now: () => t });
    expect(got.stopped).toBe("time");
    expect(many).toHaveBeenCalledTimes(2);
  });
  it("a one-item-per-call provider (the practice model) stops on a limit too", async () => {
    let n = 0;
    const one: Forecaster = { id: "http", name: "x", forecast: async () => { if (++n > 4) throw new AiUnavailableError("limit", "limit"); return { unitsPerDay: 5 }; } };
    const got = await collectAiForecasts({ ...args, forecaster: one });
    expect(got.stopped).toBe("limit");
    expect(n).toBeLessThan(25);
    expect(got.rows.length + got.failed).toBe(25);
  });
});

describe("the owner never sees an AI error", () => {
  const list = items(12);
  const d = { items: list, sales: sales(list) };
  const store = (saved: AiForecastRow[][] = [], failSave = false): Store => ({
    getBusinessDay: realBusinessDay,
    listItems: async () => d.items, listDistributors: async () => [], listSales: async () => d.sales, listCalendar: async () => [], openOrderQty: async () => ({}),
    listAiForecasts: async () => [], saveAiForecasts: async (rows: AiForecastRow[]) => { if (failSave) throw new Error("table missing"); saved.push(rows); },
  }) as unknown as Store;
  const useGemini = () => { process.env.AI_MODE = "shadow"; process.env.AI_FORECASTER = "gemini"; process.env.AI_FORECAST_KEY = KEY; };
  afterEach(() => { delete process.env.AI_MODE; delete process.env.AI_FORECASTER; delete process.env.AI_FORECAST_KEY; });

  it("saves the AI forecasts in shadow mode", async () => {
    useGemini();
    vi.stubGlobal("fetch", vi.fn(async (_u: unknown, init?: RequestInit) => geminiReply(String(init!.body))));
    const saved: AiForecastRow[][] = [];
    const s = await runShadow(store(saved));
    expect(s).toMatchObject({ provider: "gemini", saved: 12, failed: 0, stopped: null });
    expect(saved[0]).toHaveLength(12);
  });
  it("the free limit: no throw, nothing saved, 'stopped: limit'", async () => {
    useGemini();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    const saved: AiForecastRow[][] = [];
    const s = await runShadow(store(saved));
    expect(s).toMatchObject({ saved: 0, stopped: "limit" });
  });
  it("the AI is down: no throw", async () => {
    useGemini();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(runShadow(store())).resolves.toMatchObject({ saved: 0 });
  });
  it("the database cannot save the rows: no throw", async () => {
    useGemini();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (_u: unknown, init?: RequestInit) => geminiReply(String(init!.body))));
    await expect(runShadow(store([], true))).resolves.toMatchObject({ saved: 0, stopped: "error" });
  });
  it("the log never holds the key", async () => {
    useGemini();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`denied for ${KEY}`, { status: 403 })));
    await runShadow(store());
    expect(JSON.stringify(log.mock.calls)).not.toContain(KEY);
  });
  it("orders are identical with the AI working, failing or off (shadow mode)", async () => {
    const pure = await computeShopDesk(store(), { useAi: false });
    useGemini();
    vi.stubGlobal("fetch", vi.fn(async (_u: unknown, init?: RequestInit) => geminiReply(String(init!.body), (id) => ({ itemId: id, unitsPerDay: 99 }))));
    const withAi = await computeShopDesk(store());
    for (const it of list) {
      expect(withAi.results.get(it.id)!.forecast).toBe(pure.results.get(it.id)!.forecast);
      expect(withAi.results.get(it.id)!.decision).toEqual(pure.results.get(it.id)!.decision);
    }
  });
});

describe("the nightly job and the AI", () => {
  const list = items(12);
  const shop = (): ShopData => ({ items: list, sales: sales(list), calendar: [], onOrder: {} });
  function db(opts: { failAi?: boolean } = {}) {
    const desk: NightlyRows[] = [];
    const ai: { shop: string; rows: AiForecastRow[] }[] = [];
    const d: NightlyDb = {
      listShopIds: async () => ["S1", "S2"], loadShop: async () => shop(), saveRows: async (r) => { desk.push(r); },
      saveAiRows: async (shopId, rows) => { if (opts.failAi) throw new Error("ai_forecasts is missing"); ai.push({ shop: shopId, rows }); },
    };
    return { d, desk, ai };
  }
  const okAi: Forecaster = { id: "gemini", name: "x", forecast: async () => ({ unitsPerDay: 9 }), forecastMany: async (r) => new Map(r.map((x) => [x.item.id, { unitsPerDay: 9, low: 7, high: 11 }])) };

  it("with no AI set up it saves no AI rows", async () => {
    const f = db();
    expect((await runNightly(f.d, RUN)).ai).toEqual({ provider: null, saved: 0, failed: 0, stopped: null });
    expect(f.ai).toHaveLength(0);
  });
  it("saves an AI second opinion for each shop, after the Forecast Desk rows", async () => {
    const f = db();
    const s = await runNightly(f.d, RUN, { forecaster: okAi });
    expect(s).toMatchObject({ shops: 2, failedShops: 0, ai: { provider: "gemini", saved: 24, failed: 0, stopped: null } });
    expect(f.ai.map((x) => x.shop)).toEqual(["S1", "S2"]);
    expect(f.desk).toHaveLength(2);
  });
  it("an AI that is out of free requests does not fail the job; the Desk rows are saved", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out: Forecaster = { ...okAi, forecastMany: async () => { throw new AiUnavailableError("limit", "limit"); } };
    const f = db();
    const s = await runNightly(f.d, RUN, { forecaster: out });
    expect(s).toMatchObject({ shops: 2, failedShops: 0, ai: { saved: 0, stopped: "limit" } });
    expect(f.desk).toHaveLength(2);
    expect(f.ai).toHaveLength(0);
  });
  it("a database error while saving AI rows does not fail the job either", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = db({ failAi: true });
    const s = await runNightly(f.d, RUN, { forecaster: okAi });
    expect(s).toMatchObject({ shops: 2, failedShops: 0, ai: { stopped: "error" } });
    expect(f.desk).toHaveLength(2);
  });
  it("stops asking the AI when its time budget is used up", async () => {
    let t = 0;
    const slow: Forecaster = { ...okAi, forecastMany: async (r) => { t += 100; return new Map(r.map((x) => [x.item.id, { unitsPerDay: 9 }])); } };
    const f = db();
    const s = await runNightly(f.d, RUN, { forecaster: slow, aiBudgetMs: 50, now: () => t });
    expect(s.ai.stopped).toBe("time");
    expect(s.failedShops).toBe(0);
  });
});
