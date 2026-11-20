import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// B14 (UAT): the helper must be able to sign out. A helper sees only the Sell screen (no bottom bar, no More tab).
const src = (p: string) => readFileSync(path.resolve(import.meta.dirname, "..", p), "utf8");

describe("sign out", () => {
  it("the helper gets a Sign out button in the header, next to the role badge (live mode only)", () => {
    const layout = src("app/layout.tsx");
    expect(layout).toContain("<SignOutConfirm");
    expect(layout).toMatch(/isLive && me\?\.role === "helper" && <SignOutConfirm/);
    // the button sits in the same group as the Helper badge
    expect(layout.indexOf('<Badge>Helper</Badge>')).toBeLessThan(layout.indexOf("<SignOutConfirm"));
    expect(layout.indexOf("<SignOutConfirm")).toBeLessThan(layout.indexOf("<GlassMode"));
  });
  it("it asks first: 'Sign out of StockSaathi?' with Yes and Cancel, and Cancel is the focused answer", () => {
    const c = src("components/SignOutConfirm.tsx");
    expect(c).toContain("Sign out of StockSaathi?");
    expect(c).toContain("Yes, sign out");
    expect(c).toContain("Cancel");
    expect(c).toContain('role="dialog"');
    expect(c).toContain("cancel.current?.focus()");
    expect(c).toContain('"Escape"');
  });
  it("signing out clears this phone only (the demo accounts are shared) and goes to /login", () => {
    const s = src("lib/sign-out.ts");
    expect(s).toContain('signOut({ scope: "local" })');
    expect(s).toContain('window.location.href = "/login"');
    expect(src("components/SignOutButton.tsx")).toContain("signOutHere");
  });
  it("the owner can sign out from More (a link at the bottom) and from More > Your account", () => {
    const more = src("app/more/page.tsx");
    expect(more).toContain("<SignOutConfirm");
    expect(more).toMatch(/isLive && <SignOutConfirm/);
    // at the bottom: after the 'Signed in as' line
    expect(more.indexOf("who-and-version")).toBeLessThan(more.indexOf("<SignOutConfirm"));
    const account = src("app/setup/account/page.tsx");
    expect(account).toContain("<SignOutButton");
  });
});
