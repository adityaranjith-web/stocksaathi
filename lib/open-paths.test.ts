import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isOpenPath } from "./open-paths";

const ROOT = path.resolve(import.meta.dirname, "..");
const src = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

describe("what a signed-out visitor may open (live mode)", () => {
  it("the Privacy Policy and the Terms of Service are public", () => {
    expect(isOpenPath("/privacy")).toBe(true);
    expect(isOpenPath("/terms")).toBe(true);
    expect(isOpenPath("/privacy/")).toBe(true); // a trailing slash is the same page
    expect(isOpenPath("/terms/")).toBe(true);
  });
  it("only those exact pages: a look-alike address stays closed", () => {
    for (const p of ["/privacy-notes", "/privacy/x", "/terms-of-trade", "/terms/x", "/privacy.json", "/Privacy"]) expect(isOpenPath(p), p).toBe(false);
  });
  it("the pages that were already open still are", () => {
    for (const p of ["/login", "/login?error=signin", "/auth/callback", "/api/cron/nightly", "/api/health", "/api/demo-login"]) expect(isOpenPath(p.split("?")[0]), p).toBe(true);
  });
  it("every owner screen, helper screen and write route is still closed to a signed-out visitor", () => {
    const closed = ["/", "/sell", "/reorder", "/deliveries", "/more", "/stock", "/scorecard", "/ai", "/onboarding", "/item/abc", "/setup/items", "/setup/helpers",
      "/setup/account", "/setup/calendar", "/api/sales", "/api/orders", "/api/items", "/api/account", "/api/onboarding", "/api/ai/run", "/api/day/close", "/api/day/reset"];
    for (const p of closed) expect(isOpenPath(p), p).toBe(false);
  });
  it("the middleware uses this rule, so the two cannot drift apart", () => {
    const mw = src("middleware.ts");
    expect(mw).toContain('from "@/lib/open-paths"');
    expect(mw).toContain("isOpenPath(req.nextUrl.pathname)");
    expect(mw).toMatch(/!data\.user && !open\)\s*return NextResponse\.redirect/); // still redirects everyone else to /login
  });
});
