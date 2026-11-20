import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// B12: the "Close the day" card must show the CURRENT number of sales, not the number from before the last sale.
const h = vi.hoisted(() => ({ salesToday: 0, denied: null as Response | null }));
vi.mock("@/lib/auth", () => ({ teamOnly: async () => h.denied }));
vi.mock("@/lib/data", () => ({ getStore: () => ({ getBusinessDay: async () => ({ date: "2026-11-24", realDate: "2026-11-20", simulated: true, sampleShop: true, salesToday: h.salesToday }) }) }));
import { GET } from "@/app/api/day/status/route";

describe("GET /api/day/status (what the Close the day card reads)", () => {
  beforeEach(() => { h.salesToday = 0; h.denied = null; });
  it("gives the count as it is now, every time (a sale between two calls changes the answer)", async () => {
    h.salesToday = 1;
    const a = await GET();
    expect(await a.json()).toEqual({ date: "2026-11-24", salesToday: 1 });
    h.salesToday = 3; // two more sales were recorded
    const b = await GET();
    expect((await b.json()).salesToday).toBe(3);
    expect(b.headers.get("Cache-Control")).toBe("no-store"); // never kept by the browser or a server
  });
  it("is for the owner on the product team only", async () => {
    h.denied = new Response("Only the product team can do this.", { status: 403 });
    const r = await GET();
    expect(r.status).toBe(403);
  });
});

describe("the Close the day card looks the count up again", () => {
  const src = readFileSync(path.resolve(import.meta.dirname, "../components/BusinessDayControls.tsx"), "utf8");
  it("when it is shown, when the page comes back from the browser's memory (Back button), and when it is opened", () => {
    expect(src).toContain('fetch("/api/day/status"');
    expect(src).toContain('"pageshow"');
    expect(src).toMatch(/setStep\("close"\);[^}]*refreshCount\(\)/);
  });
  it("shows the number it looked up, not the one it was given", () => {
    expect(src).toMatch(/Only \{count\} sale/);
    expect(src).not.toMatch(/Only \{salesToday\} sale/);
  });
});
