import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, runDesk } from "@/lib/forecast/desk";
import { asOfDay } from "@/lib/dates";
import { buildSeries, runShopDesk } from "@/lib/desk-service";
import { runNightly, type NightlyDb, type ShopData } from "@/lib/nightly";
import { buildAiRequest } from "./payload";
import { geminiForecaster } from "./providers";
import { collectAiForecasts } from "./run";
import { AiUnavailableError, type AiForecastRequest, type Forecaster } from "./types";
import type { Item } from "@/lib/data/types";

// A busy Gemini. On 12 Nov 2026 two of three calls got "503 service unavailable" and only 10 of 30 items were saved.
// Now: calls of 5 items, a pause between calls, and a call that fails in a way that may pass is tried again.

const KEY = "AIza-test-key-0123456789";
const RUN = asOfDay();
const item = (id: string): Item => ({ id, name: `Item ${id}`, category: "T", pack: "1", price: 10, distributorId: "D", leadTimeDays: 2, minSafetyStock: 2, orderCoverDays: 7, currentStock: 30 });
const items = (n: number) => Array.from({ length: n }, (_, i) => item(`I${String(i + 1).padStart(3, "0")}`));
const sales = (list: Item[]) => list.flatMap((it) => Array.from({ length: 56 }, (_, k) => ({ date: addDays(RUN, -k), itemId: it.id, qty: 8 + (k % 5) })));

const sentItems = (init?: RequestInit) => JSON.parse(JSON.parse(String(init!.body)).contents[0].parts[0].text).items as AiForecastRequest[];
/** A Gemini reply that answers every item that was sent. */
function goodReply(init?: RequestInit) {
  const list = sentItems(init).map((r) => ({ itemId: r.item.id, unitsPerDay: 10, low: 8, high: 12 }));
  return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(list) }] } }] });
}
const status = (code: number, body = "") => new Response(body, { status: code });
const googleBody = (code: number, word: string, retryDelay?: string) => JSON.stringify({ error: { code, message: "Some text from Google", status: word, ...(retryDelay ? { details: [{ retryDelay }] } : {}) } });
const busy = () => status(503, googleBody(503, "UNAVAILABLE"));
const waits = () => { const w: number[] = []; return { w, opts: { sleep: async (ms: number) => { w.push(ms); } } }; };
/** Answers with the given replies one after the other, then with a good answer. */
const script = (...first: Response[]) => {
  const queue = [...first];
  return vi.fn(async (_u: string | URL | Request, init?: RequestInit) => queue.shift() ?? goodReply(init));
};
const asFetch = (f: unknown) => f as unknown as typeof fetch;
const req = (id: string): AiForecastRequest => {
  const it = item(id);
  const series = buildSeries(id, sales([it]), RUN);
  const input = { itemId: id, leadTimeDays: 2, minSafetyStock: 2, orderCoverDays: 7, currentStock: 30, onOrder: 0 };
  return buildAiRequest({ item: it, input, result: runDesk(input, series, []), series, calendar: [], asOf: RUN, horizonDays: 9 });
};

afterEach(() => vi.restoreAllMocks());

describe("one call to Gemini", () => {
  it("asks for 5 items at a time", () => {
    expect(geminiForecaster(KEY).batchSize).toBe(5);
  });
  it("a 503 is tried again after 2 seconds, and the answer is used", async () => {
    const t = waits();
    const f = script(busy());
    const out = await geminiForecaster(KEY, undefined, 5000, asFetch(f), t.opts).forecastMany!([req("I001")]);
    expect(out.size).toBe(1);
    expect(f).toHaveBeenCalledTimes(2);
    expect(t.w).toEqual([2000]);
  });
  it("a 503 that does not pass is tried 3 times in all (waits 2 s, then 4 s), then reported with its reason", async () => {
    const t = waits();
    const f = vi.fn(async () => busy());
    const e = await geminiForecaster(KEY, undefined, 5000, asFetch(f), t.opts).forecastMany!([req("I001")]).catch((x: Error) => x);
    expect(f).toHaveBeenCalledTimes(3);
    expect(t.w).toEqual([2000, 4000]);
    expect(e).toBeInstanceOf(AiUnavailableError);
    expect((e as Error).message).toBe("The AI service answered 503 UNAVAILABLE.");
    expect((e as AiUnavailableError).reason).toBe("error");
  });
  it("a refused key or a bad request is not tried again", async () => {
    for (const code of [400, 401, 403, 404]) {
      const t = waits();
      const f = vi.fn(async () => status(code, googleBody(code, "PERMISSION_DENIED")));
      await expect(geminiForecaster(KEY, undefined, 5000, asFetch(f), t.opts).forecastMany!([req("I001")])).rejects.toMatchObject({ reason: "error" });
      expect(f).toHaveBeenCalledTimes(1);
      expect(t.w).toEqual([]);
    }
  });
  it("an empty or cut-off answer is asked for again", async () => {
    const empty = Response.json({ candidates: [] });
    const cut = Response.json({ candidates: [{ content: { parts: [{ text: "[{\"itemId\": \"I001\", \"unitsPer" }] } }] });
    for (const bad of [empty, cut]) {
      const f = script(bad);
      const out = await geminiForecaster(KEY, undefined, 5000, asFetch(f), waits().opts).forecastMany!([req("I001")]);
      expect(out.size).toBe(1);
      expect(f).toHaveBeenCalledTimes(2);
    }
  });
  it("a dropped connection is tried again", async () => {
    let n = 0;
    const f = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => { if (n++ === 0) throw new TypeError("fetch failed"); return goodReply(init); });
    expect((await geminiForecaster(KEY, undefined, 5000, asFetch(f), waits().opts).forecastMany!([req("I001")])).size).toBe(1);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("a 429 that says 'try again in 3 seconds' is waited out", async () => {
    const t = waits();
    const f = script(status(429, googleBody(429, "RESOURCE_EXHAUSTED", "3s")));
    expect((await geminiForecaster(KEY, undefined, 5000, asFetch(f), t.opts).forecastMany!([req("I001")])).size).toBe(1);
    expect(t.w).toEqual([3500]);
  });
  it("a 429 with a long wait, or none, means the free limit is used up: no more tries", async () => {
    for (const body of [googleBody(429, "RESOURCE_EXHAUSTED", "40s"), googleBody(429, "RESOURCE_EXHAUSTED")]) {
      const t = waits();
      const f = vi.fn(async () => status(429, body));
      await expect(geminiForecaster(KEY, undefined, 5000, asFetch(f), t.opts).forecastMany!([req("I001")])).rejects.toMatchObject({ reason: "limit" });
      expect(f).toHaveBeenCalledTimes(1);
      expect(t.w).toEqual([]);
    }
  });
  it("does not try again when there is not enough time left before the deadline", async () => {
    const f = vi.fn(async () => busy());
    await expect(geminiForecaster(KEY, undefined, 5000, asFetch(f), waits().opts).forecastMany!([req("I001")], { deadline: Date.now() + 2000 })).rejects.toBeInstanceOf(AiUnavailableError);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("the reason never holds the key, even if Google's answer does", async () => {
    const f = vi.fn(async () => status(503, JSON.stringify({ error: { message: `key ${KEY} is bad`, status: "UNAVAILABLE" } })));
    const e = await geminiForecaster(KEY, undefined, 5000, asFetch(f), waits().opts).forecastMany!([req("I001")]).catch((x: Error) => x);
    expect((e as Error).message).not.toContain(KEY);
  });
});

describe("a whole shop", () => {
  const run = (list: Item[], f: unknown, t: ReturnType<typeof waits>) => collectAiForecasts({
    forecaster: geminiForecaster(KEY, undefined, 5000, asFetch(f), t.opts),
    items: list, results: runShopDesk({ asOf: RUN, items: list, sales: sales(list), calendar: [], onOrder: {} }),
    sales: sales(list), calendar: [], onOrder: {}, asOf: RUN, runDate: RUN, sleep: t.opts.sleep,
  });

  it("12 items go out in calls of 5, 5 and 2, with a pause of 1.5 seconds between calls", async () => {
    const t = waits();
    const sizes: number[] = [];
    const f = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => { sizes.push(sentItems(init).length); return goodReply(init); });
    const got = await run(items(12), f, t);
    expect(sizes).toEqual([5, 5, 2]);
    expect(t.w).toEqual([1500, 1500]);
    expect(got).toMatchObject({ failed: 0, stopped: null });
    expect(got.rows).toHaveLength(12);
  });
  it("30 items, with 503 on the 2nd call twice (as on 12 Nov): every item is saved, because the call is tried again", async () => {
    const order = ["ok", "503", "503", "ok", "ok", "ok", "ok"];
    let n = 0;
    const f = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => (order[n++] === "503" ? busy() : goodReply(init)));
    const got = await run(items(30), f, waits());
    expect(got.rows).toHaveLength(30);
    expect(got).toMatchObject({ failed: 0, stopped: null });
  });
  it("when one call stays busy through all its tries, only its 5 items are lost; the rest are saved", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => (sentItems(init)[0].item.id === "I006" ? busy() : goodReply(init)));
    const got = await run(items(20), f, waits());
    expect(got.rows).toHaveLength(15);
    expect(got.failed).toBe(5);
    expect(got.stopped).toBeNull(); // one lost call is not "the service is down"
    expect(got.firstError).toBe("The AI service answered 503 UNAVAILABLE.");
  });
  it("the nightly job's answer names the reason, so the Vercel logs are not needed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const list = items(6);
    const down: Forecaster = { id: "gemini", name: "x", batchSize: 3, forecast: async () => ({ unitsPerDay: 1 }), forecastMany: async () => { throw new AiUnavailableError("The AI service answered 503 UNAVAILABLE.", "error"); } };
    const shopData: ShopData = { items: list, sales: sales(list), calendar: [], onOrder: {} };
    const db: NightlyDb = { listShopIds: async () => ["S1"], loadShop: async () => shopData, saveRows: async () => {}, saveAiRows: async () => {} };
    const s = await runNightly(db, RUN, { forecaster: down, aiPauseMs: 0 });
    expect(s.failedShops).toBe(0);
    expect(s.ai).toMatchObject({ saved: 0, failed: 6, stopped: "error", firstError: "The AI service answered 503 UNAVAILABLE." });
  });
});
