import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { latestAiOpinion, NO_AI_OPINION_YET } from "./ai-opinion";
import { canCloseDay } from "./business-day";
import { buildVersion } from "./build-info";
import type { AiForecastRow } from "./data/types";

// "I cannot see Close the day on Home, and the AI second opinion box does not show on Why this number" (13 Nov 2026).
// On production both were present for the demo owner (the server's page, and in a real browser). These tests keep the rules
// that decide whether each one shows in one place, and keep a panel from ever staying invisible.

const ROOT = path.resolve(import.meta.dirname, "..");
const src = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const row = (over: Partial<AiForecastRow>): AiForecastRow => ({ runDate: "2026-11-13", itemId: "SUGAR", provider: "gemini", aiUnitsPerDay: 9.5, blendUnitsPerDay: 9.5, horizonDays: 9, low: null, high: null, ...over });

describe("which AI forecast the Why this number screen shows", () => {
  it("the latest one for this item from the AI that is switched on", () => {
    const rows = [row({ runDate: "2026-11-11", aiUnitsPerDay: 8 }), row({ runDate: "2026-11-13", aiUnitsPerDay: 9.5 }), row({ runDate: "2026-11-12", aiUnitsPerDay: 9 })];
    expect(latestAiOpinion(rows, "gemini", "SUGAR")?.aiUnitsPerDay).toBe(9.5);
  });
  it("does not depend on the shop's date: a run date ahead of or behind it is still shown", () => {
    // The shop is on 14 Nov, the real date is 13 Nov, and the AI was asked on 11 Nov, 13 Nov and 20 Nov: the latest is shown.
    const rows = [row({ runDate: "2026-11-11" }), row({ runDate: "2026-11-20", aiUnitsPerDay: 7 })];
    expect(latestAiOpinion(rows, "gemini", "SUGAR")?.aiUnitsPerDay).toBe(7);
    expect(latestAiOpinion([row({ runDate: "2026-10-01" })], "gemini", "SUGAR")).toBeDefined();
  });
  it("ignores other items and other AI providers", () => {
    const rows = [row({ itemId: "TEA" }), row({ provider: "mock", aiUnitsPerDay: 1 })];
    expect(latestAiOpinion(rows, "gemini", "SUGAR")).toBeUndefined();
    expect(latestAiOpinion(rows, "mock", "SUGAR")?.aiUnitsPerDay).toBe(1);
    expect(latestAiOpinion([], "gemini", "SUGAR")).toBeUndefined();
  });
  it("the box is there whenever the AI is switched on; with no forecast yet it says so in plain words", () => {
    const page = src("app/item/[id]/page.tsx");
    expect(page).toContain("latestAiOpinion(");
    expect(page).toMatch(/\{forecaster && \(/); // not {ai && (: a missing forecast no longer hides the whole box
    expect(page).toContain("NO_AI_OPINION_YET");
    for (const sentence of NO_AI_OPINION_YET.split(/(?<=[.?!])\s+/)) expect(sentence.trim().split(/\s+/).length).toBeLessThanOrEqual(14);
  });
  it("a failed read of the AI forecasts is written to the log, not swallowed", () => {
    expect(src("app/item/[id]/page.tsx")).toContain("the AI forecasts could not be read");
  });
});

describe("who sees Close the day", () => {
  it("the owner on the product team, nobody else", () => {
    expect(canCloseDay({ role: "owner", isTeam: true })).toBe(true);
    expect(canCloseDay({ role: "owner", isTeam: false })).toBe(false);
    expect(canCloseDay({ role: "helper", isTeam: true })).toBe(false);
    expect(canCloseDay({ role: "helper", isTeam: false })).toBe(false);
  });
  it("Home uses that rule for the card, and the card holds both buttons", () => {
    expect(src("app/page.tsx")).toContain("canCloseDay(me)");
    expect(src("app/page.tsx")).toContain("<BusinessDayControls");
    const card = src("components/BusinessDayControls.tsx");
    expect(card).toContain("Close the day");
    expect(card).toContain("Back to real date");
  });
});

describe("the owner can see who they are signed in as, and which version is running", () => {
  it("the version is the short Git commit Vercel built, or nothing on a computer", () => {
    expect(buildVersion({ VERCEL_GIT_COMMIT_SHA: "9cb39996b5f7e0ad39a2b5fc2f9a3c1bd75bf6f3" })).toBe("9cb3999");
    expect(buildVersion({})).toBeNull();
    expect(buildVersion({ VERCEL_GIT_COMMIT_SHA: "not a commit" })).toBeNull();
  });
  it("More shows the name, the role, 'product team' when it applies, and the version", () => {
    const more = src("app/more/page.tsx");
    expect(more).toContain("Signed in as");
    expect(more).toContain("product team");
    expect(more).toContain("buildVersion()");
    expect(src("app/api/health/route.ts")).toContain("build");
  });
});

describe("a panel never stays invisible", () => {
  const css = src("app/globals.css");
  it("the stylesheet's braces are balanced (the @layer block that holds the panels is closed)", () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"\n]*"|'[^'\n]*'/g, '""');
    let depth = 0;
    for (const ch of bare) { if (ch === "{") depth++; if (ch === "}") depth--; expect(depth).toBeGreaterThanOrEqual(0); }
    expect(depth).toBe(0);
  });
  it("after the entrance animation's time, every panel is shown as it is, whether or not the animation ran", () => {
    expect(css).toContain('html[data-motion="done"] .rise');
    expect(css).toMatch(/html\[data-motion="done"\] \.rise \{[^}]*animation: none;[^}]*opacity: 1;/);
    const guard = src("components/MotionGuard.tsx");
    expect(guard).toContain('dataset.motion = "done"');
    expect(guard).toContain('dataset.motion = "running"');
    expect(guard).toContain("useLayoutEffect"); // before the new screen is drawn
    expect(src("app/layout.tsx")).toContain("<MotionGuard />");
  });
});
