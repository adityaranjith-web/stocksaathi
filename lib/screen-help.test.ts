import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { HOW_IT_WORKS, HOW_IT_WORKS_COOKIE, MORE_HELP, SCREEN_HELP } from "./screen-help";

const ROOT = path.resolve(import.meta.dirname, "..");
const src = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const everyLine = [...Object.values(SCREEN_HELP), ...Object.values(MORE_HELP), ...HOW_IT_WORKS.steps.map((s) => s.text)];
const sentences = (t: string) => t.split(/(?<=[.?!])\s+/).filter(Boolean);
const words = (t: string) => t.trim().split(/\s+/).length;

describe("the line under each screen title", () => {
  it("says what the owner asked for", () => {
    expect(SCREEN_HELP).toEqual({
      home: "Today's summary. Tap a number to see the list.",
      sell: "Tap what the customer bought. This is how the app learns what sells.",
      reorder: "What to order today and how much. Change any number, then tap Share.",
      deliveries: "Stock arrived? Confirm the quantities here.",
      more: "Set-up and reports.",
    });
  });
  it("is used on each of the five screens", () => {
    for (const [file, key] of [["app/page.tsx", "home"], ["app/sell/page.tsx", "sell"], ["app/reorder/page.tsx", "reorder"], ["app/deliveries/page.tsx", "deliveries"], ["app/more/page.tsx", "more"]]) {
      expect(src(file), file).toContain(`SCREEN_HELP.${key}`);
    }
  });
});

describe("plain, short English (CLAUDE.md rule 5)", () => {
  it("every sentence is 12 words or fewer", () => {
    for (const t of everyLine) for (const s of sentences(t)) expect(words(s), s).toBeLessThanOrEqual(12);
  });
  it("uses no jargon", () => {
    const jargon = /replenish|recommendation|forecast model|algorithm|configure|dashboard|utilis|inventory|SKU|KPI/i;
    for (const t of everyLine) expect(t).not.toMatch(jargon);
  });
});

describe("How StockSaathi works card", () => {
  it("has the four steps in order: sell, reorder, share on WhatsApp, record delivery", () => {
    expect(HOW_IT_WORKS.steps.map((s) => s.title)).toEqual(["Sell", "Reorder", "Share on WhatsApp", "Record delivery"]);
  });
  it("is closed with a cookie that Home reads on the server, so it does not flash back", () => {
    expect(src("components/HowItWorks.tsx")).toContain("HOW_IT_WORKS_COOKIE");
    expect(src("components/HowItWorks.tsx")).toContain("max-age=");
    expect(src("app/page.tsx")).toContain("cookies()");
    expect(src("app/page.tsx")).toContain("HOW_IT_WORKS_COOKIE");
    expect(HOW_IT_WORKS_COOKIE).toBe("ss_howto_closed");
  });
  it("is on Home only, for the owner (Home is owner-only)", () => {
    expect(src("app/page.tsx")).toContain("requireOwner");
    expect(src("app/page.tsx")).toContain("<HowItWorks");
  });
});

describe("More screen", () => {
  const more = src("app/more/page.tsx");
  it("every item has a short one-line description", () => {
    const entries = [...more.matchAll(/\{ href: "([^"]+)", icon: "[a-z]+", title: "[^"]+", text: ([^}]+) \}/g)];
    expect(entries.length).toBeGreaterThanOrEqual(7);
    for (const [, href, text] of entries) {
      expect(text, href).toContain("MORE_HELP"); // never a hand-written long text in the page
    }
  });
  it("every description is one short line (under 45 characters)", () => {
    for (const [href, text] of Object.entries(MORE_HELP)) expect(text.length, href).toBeLessThanOrEqual(45);
  });
  it("describes each screen the page links to", () => {
    for (const href of ["/scorecard", "/stock", "/setup/items", "/setup/distributors", "/setup/helpers", "/setup/calendar", "/setup/account", "/ai"]) {
      expect(more, href).toContain(`MORE_HELP["${href}`);
    }
  });
});
