import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { demoAccounts, handleDemoLogin, matchDemoAccount, type DemoLoginDeps } from "./demo-login";

const ENV = { DEMO_OWNER_EMAIL: "Owner.Demo@Example.com", DEMO_HELPER_EMAIL: "helper.demo@example.com" };
const PASSWORD = "not-a-real-password-for-tests";

function deps(over: Partial<DemoLoginDeps> = {}): DemoLoginDeps & { signIn: ReturnType<typeof vi.fn>; signOut: ReturnType<typeof vi.fn> } {
  return {
    env: ENV, live: true,
    signIn: vi.fn(async () => ({ userId: "U1" })),
    readRow: vi.fn(async () => ({ role: "owner", shopId: "SHOP" })),
    signOut: vi.fn(async () => {}),
    ...over,
  } as never;
}

describe("which accounts are demo accounts", () => {
  it("exactly two, from the server settings, ignoring capital letters and spaces", () => {
    expect(demoAccounts(ENV)).toEqual({ owner: "owner.demo@example.com", helper: "helper.demo@example.com" });
    expect(matchDemoAccount("  OWNER.demo@example.com ", ENV)).toBe("owner");
    expect(matchDemoAccount("helper.demo@example.com", ENV)).toBe("helper");
  });
  it("nobody else is a demo account", () => {
    for (const e of ["someone@example.com", "owner.demo@example.com.evil.io", "", null, undefined, 42, "owner.demo@example.co"]) expect(matchDemoAccount(e, ENV)).toBeNull();
  });
  it("is switched off unless both emails are set, valid and different", () => {
    expect(demoAccounts({})).toBeNull();
    expect(demoAccounts({ DEMO_OWNER_EMAIL: "a@b.co" })).toBeNull();
    expect(demoAccounts({ DEMO_OWNER_EMAIL: "a@b.co", DEMO_HELPER_EMAIL: "a@b.co" })).toBeNull();
    expect(demoAccounts({ DEMO_OWNER_EMAIL: "not an email", DEMO_HELPER_EMAIL: "a@b.co" })).toBeNull();
    expect(matchDemoAccount("a@b.co", { DEMO_OWNER_EMAIL: "a@b.co" })).toBeNull();
  });
});

describe("signing in with Demo login", () => {
  it("lets the owner demo account in, and asks Supabase for the password check", async () => {
    const d = deps();
    expect(await handleDemoLogin({ email: ENV.DEMO_OWNER_EMAIL, password: PASSWORD }, d)).toEqual({ status: 200, role: "owner" });
    expect(d.signIn).toHaveBeenCalledWith("owner.demo@example.com", PASSWORD);
  });
  it("lets the helper demo account in", async () => {
    const d = deps({ readRow: vi.fn(async () => ({ role: "helper", shopId: "SHOP" })) });
    expect(await handleDemoLogin({ email: ENV.DEMO_HELPER_EMAIL, password: PASSWORD }, d)).toEqual({ status: 200, role: "helper" });
  });
  it("refuses any other email WITHOUT asking Supabase, in the same words as a wrong password", async () => {
    const d = deps();
    const other = await handleDemoLogin({ email: "someone@example.com", password: PASSWORD }, d);
    expect(other.status).toBe(401);
    expect(d.signIn).not.toHaveBeenCalled();
    const wrong = await handleDemoLogin({ email: ENV.DEMO_OWNER_EMAIL, password: PASSWORD }, deps({ signIn: vi.fn(async () => ({ problem: "wrong" as const })) }));
    expect(wrong).toEqual(other);
  });
  it("refuses a missing, empty or silly password and a broken request", async () => {
    const d = deps();
    for (const body of [null, "x", {}, { email: ENV.DEMO_OWNER_EMAIL }, { email: ENV.DEMO_OWNER_EMAIL, password: "" }, { email: ENV.DEMO_OWNER_EMAIL, password: 5 }, { email: ENV.DEMO_OWNER_EMAIL, password: "x".repeat(500) }]) {
      expect((await handleDemoLogin(body, d)).status).toBe(401);
    }
    expect(d.signIn).not.toHaveBeenCalled();
  });
  it("says so plainly when Supabase is busy or down", async () => {
    expect((await handleDemoLogin({ email: ENV.DEMO_OWNER_EMAIL, password: PASSWORD }, deps({ signIn: vi.fn(async () => ({ problem: "busy" as const })) }))).status).toBe(429);
    expect((await handleDemoLogin({ email: ENV.DEMO_OWNER_EMAIL, password: PASSWORD }, deps({ signIn: vi.fn(async () => ({ problem: "down" as const })) }))).status).toBe(503);
  });
  it("is closed when demo login is not switched on, and in demo mode", async () => {
    expect((await handleDemoLogin({ email: "a@b.co", password: PASSWORD }, deps({ env: {} }))).status).toBe(404);
    expect((await handleDemoLogin({ email: ENV.DEMO_OWNER_EMAIL, password: PASSWORD }, deps({ live: false }))).status).toBe(400);
  });
  it("signs the person out again when the account is not linked to the demo shop (so no one creates a shop by accident)", async () => {
    for (const row of [null, { role: "owner", shopId: null }]) {
      const d = deps({ readRow: vi.fn(async () => row) });
      const r = await handleDemoLogin({ email: ENV.DEMO_OWNER_EMAIL, password: PASSWORD }, d);
      expect(r.status).toBe(409);
      expect(r.message).toContain("link_demo_accounts.sql");
      expect(d.signOut).toHaveBeenCalledOnce();
    }
  });
  it("signs the person out again when the role in the database is not the role of that demo account", async () => {
    const d = deps({ readRow: vi.fn(async () => ({ role: "helper", shopId: "SHOP" })) }); // the owner email, but a helper row
    const r = await handleDemoLogin({ email: ENV.DEMO_OWNER_EMAIL, password: PASSWORD }, d);
    expect(r.status).toBe(409);
    expect(d.signOut).toHaveBeenCalledOnce();
  });
});

describe("no password is kept in the code", () => {
  const ROOT = path.resolve(import.meta.dirname, "..");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? (n === "node_modules" || n === ".next" ? [] : files(p)) : /\.(ts|tsx|json|sql|md)$/.test(n) ? [p] : [];
  });
  const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");
  const code = ["app", "components", "lib"].flatMap((d) => files(path.join(ROOT, d))).filter((p) => /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p));

  it("passwords are checked by Supabase in one place only: app/api/demo-login/route.ts", () => {
    expect(code.filter((p) => readFileSync(p, "utf8").includes("signInWithPassword")).map(rel)).toEqual(["app/api/demo-login/route.ts"]);
  });
  it("no setting is called a demo password", () => {
    expect(code.filter((p) => /DEMO_[A-Z_]*PASSWORD|PASSWORD[A-Z_]*DEMO/i.test(readFileSync(p, "utf8"))).map(rel)).toEqual([]);
  });
  it("the demo-login file refuses to load in a browser", () => {
    expect(readFileSync(path.join(ROOT, "lib/demo-login.ts"), "utf8")).toContain('typeof window !== "undefined"');
  });
});
