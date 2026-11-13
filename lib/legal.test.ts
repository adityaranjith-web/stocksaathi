import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CONTACT_EMAIL, GOOGLE_USER_DATA_POLICY_URL, LEGAL_UPDATED, PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_TITLE, TERMS_INTRO, TERMS_SECTIONS, TERMS_TITLE } from "./legal";
import { MORE_HELP } from "./screen-help";

const ROOT = path.resolve(import.meta.dirname, "..");
const src = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const privacyText = [PRIVACY_INTRO, ...PRIVACY_SECTIONS.flatMap((s) => [s.heading, ...s.paragraphs])].join("\n");
const termsText = [TERMS_INTRO, ...TERMS_SECTIONS.flatMap((s) => [s.heading, ...s.paragraphs])].join("\n");
const heading = (list: { heading: string; paragraphs: string[] }[], h: string) => list.find((s) => s.heading === h)?.paragraphs.join(" ") ?? "";

describe("Privacy Policy (the public page Google asks for)", () => {
  it("has the title and the date", () => {
    expect(PRIVACY_TITLE).toBe("StockSaathi Privacy Policy");
    expect(LEGAL_UPDATED).toBe("13 November 2026");
    expect(src("app/privacy/page.tsx")).toContain("LEGAL_UPDATED");
    expect(src("components/LegalDoc.tsx")).toContain("Last updated: {updated}");
  });
  it("says who we are, with the contact email", () => {
    const who = heading(PRIVACY_SECTIONS, "Who we are");
    expect(who).toContain("Group 3, Section 1, PGDM, Great Lakes Institute of Management, Chennai");
    expect(who).toContain(CONTACT_EMAIL);
    expect(CONTACT_EMAIL).toBe("cakeisgud4u@gmail.com");
  });
  it("says Google sign-in gives name and email only, and nothing else from Google is used", () => {
    const t = heading(PRIVACY_SECTIONS, "What we collect from Google sign-in");
    expect(t).toMatch(/name and your email/);
    expect(t).toMatch(/Gmail, Google Drive, contacts or any other Google data/);
    expect(t).toMatch(/do not access/);
  });
  it("lists what shop owners enter, and what is not collected", () => {
    const e = heading(PRIVACY_SECTIONS, "What shop owners enter");
    for (const w of ["shop details", "items", "sales", "orders", "deliveries", "helpers"]) expect(e, w).toContain(w);
    const n = heading(PRIVACY_SECTIONS, "What we do not collect");
    for (const w of ["customers' names or phone numbers", "location", "photos", "payment details"]) expect(n, w).toContain(w);
  });
  it("says why, where it is stored, who can see it, and the rights", () => {
    expect(heading(PRIVACY_SECTIONS, "Why we use it")).toMatch(/sign you in/);
    expect(heading(PRIVACY_SECTIONS, "Why we use it")).toMatch(/what to reorder/);
    const stored = heading(PRIVACY_SECTIONS, "Where it is stored");
    expect(stored).toContain("Supabase");
    expect(stored).toContain("Seoul");
    expect(stored).toContain("Vercel");
    expect(stored).toContain("Google Gemini");
    expect(stored).toMatch(/no names or emails of people/);
    const who = heading(PRIVACY_SECTIONS, "Who can see it");
    expect(who).toMatch(/Only the shop owner and their helpers/);
    expect(who).toMatch(/do not sell or share/);
    const rights = heading(PRIVACY_SECTIONS, "Your rights");
    expect(rights).toContain("More, then Your account, then Delete my account");
    expect(rights).toContain("Digital Personal Data Protection Act, 2023");
  });
  it("has the Google API Services User Data Policy line, with Limited Use, and links to it", () => {
    const g = heading(PRIVACY_SECTIONS, "Google API data");
    expect(g).toContain("Google API Services User Data Policy, including the Limited Use requirements");
    expect(g).toMatch(/^StockSaathi's use and transfer to any other app of information received from Google APIs will adhere to the/);
    expect(GOOGLE_USER_DATA_POLICY_URL).toBe("https://developers.google.com/terms/api-services-user-data-policy");
    expect(src("app/privacy/page.tsx")).toContain("GOOGLE_USER_DATA_POLICY_URL");
  });
  it("what it says about the AI matches what the app really sends (docs/ai-integration.md)", () => {
    // The AI request holds item names, sales and stock, and no shop, owner, helper, supplier or phone details.
    const ai = src("docs/ai-integration.md");
    expect(ai).toMatch(/no shop name, locality, owner, helper, distributor, salesman or phone number/);
    expect(heading(PRIVACY_SECTIONS, "Where it is stored")).toMatch(/item names, daily sales counts and stock levels/);
  });
});

describe("Terms of Service", () => {
  it("has the title and the date", () => {
    expect(TERMS_TITLE).toBe("StockSaathi Terms of Service");
    expect(src("app/terms/page.tsx")).toContain("LEGAL_UPDATED");
  });
  it("covers the points asked for", () => {
    expect(heading(TERMS_SECTIONS, "What StockSaathi is")).toMatch(/free student prototype/);
    expect(heading(TERMS_SECTIONS, "What StockSaathi is")).toMatch(/learning/);
    expect(heading(TERMS_SECTIONS, "Forecasts are suggestions")).toMatch(/suggestions only/);
    expect(heading(TERMS_SECTIONS, "Forecasts are suggestions")).toMatch(/shop owner decides what to order/);
    expect(heading(TERMS_SECTIONS, "No promises")).toMatch(/always be available/);
    expect(heading(TERMS_SECTIONS, "No promises")).toMatch(/forecasts are right/);
    expect(heading(TERMS_SECTIONS, "Use it fairly")).toMatch(/misuse the app/);
    expect(heading(TERMS_SECTIONS, "Changes")).toMatch(/change or stop the app/);
    expect(heading(TERMS_SECTIONS, "Contact")).toContain(CONTACT_EMAIL);
  });
});

describe("plain, short English (CLAUDE.md rule 5)", () => {
  it("every sentence is 28 words or fewer", () => {
    for (const text of [privacyText, termsText]) {
      for (const s of text.split(/(?<=[.?!])\s+|\n/).filter(Boolean)) {
        if (s.includes("Google API Services User Data Policy")) continue; // Google's own required wording, kept exactly
        expect(s.trim().split(/\s+/).length, s).toBeLessThanOrEqual(28);
      }
    }
  });
  it("uses no legal or technical jargon", () => {
    expect(privacyText + termsText).not.toMatch(/hereinafter|notwithstanding|indemnif|jurisdiction|pursuant|sub-?processor|cookie|encrypt/i);
  });
});

describe("the pages are public and safe to open without signing in", () => {
  it("both pages exist and read nothing about a shop or a person (no sign-in check, no data store)", () => {
    for (const p of ["app/privacy/page.tsx", "app/terms/page.tsx", "components/LegalDoc.tsx"]) {
      expect(existsSync(path.join(ROOT, p)), p).toBe(true);
      const code = src(p);
      expect(code, p).not.toMatch(/@\/lib\/auth|@\/lib\/data|requireOwner|requireUser|getStore|cookies\(\)/);
    }
  });
  it("the sign-in page links to both, and so does More", () => {
    const login = src("app/login/page.tsx");
    expect(login).toContain('href="/privacy"');
    expect(login).toContain('href="/terms"');
    expect(login).toContain("Privacy policy");
    const more = src("app/more/page.tsx");
    expect(more).toContain('href: "/privacy"');
    expect(more).toContain('href: "/terms"');
    expect(MORE_HELP["/privacy"].length).toBeLessThanOrEqual(45);
    expect(MORE_HELP["/terms"].length).toBeLessThanOrEqual(45);
  });
  it("the layout does not need a signed-in person (the screens around the page work for a visitor)", () => {
    const layout = src("app/layout.tsx");
    expect(layout).toContain("await getMe()"); // getMe returns null for a visitor; it never throws or redirects
    expect(layout).toContain("me?.role ?? null");
    expect(src("lib/auth.ts")).toMatch(/export const getMe[\s\S]*?a\.state === "ok" \? a\.me : null/);
  });
});
