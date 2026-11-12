import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Rule: secret keys never go in client code. These checks read the source files and fail if a secret name
// shows up where the browser could reach it.
const ROOT = path.resolve(import.meta.dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? (n === "node_modules" || n === ".next" ? [] : files(p)) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");
const source = ["app", "components", "lib"].flatMap((d) => files(path.join(ROOT, d))).filter((p) => !/\.test\.tsx?$/.test(p));

describe("secret keys stay on the server", () => {
  it("SUPABASE_SERVICE_ROLE_KEY is read in one file only: lib/server/supabase-admin.ts", () => {
    const hits = source.filter((p) => readFileSync(p, "utf8").includes("SUPABASE_SERVICE_ROLE_KEY"));
    expect(hits.map(rel).filter((p) => p !== "lib/server/supabase-admin.ts" && p !== "lib/server/nightly-handler.ts")).toEqual([]);
  });

  it("CRON_SECRET is read only by the nightly route", () => {
    const hits = source.filter((p) => /process\.env\.CRON_SECRET/.test(readFileSync(p, "utf8")));
    expect(hits.map(rel)).toEqual(["app/api/cron/nightly/route.ts"]);
  });

  it("no secret has a NEXT_PUBLIC_ name (those are sent to every browser)", () => {
    const bad = source.filter((p) => /NEXT_PUBLIC_[A-Z_]*(SERVICE_ROLE|CRON|SECRET|AI_FORECAST_KEY)/.test(readFileSync(p, "utf8")));
    expect(bad.map(rel)).toEqual([]);
  });

  it("no browser (\"use client\") file imports server-only code", () => {
    const clients = source.filter((p) => /^\s*["']use client["']/.test(readFileSync(p, "utf8")));
    const bad = clients.filter((p) => /from\s+["']@\/lib\/(server\/|nightly["']|forecast\/ai\/(registry|providers|shadow))/.test(readFileSync(p, "utf8")));
    expect(bad.map(rel)).toEqual([]);
    expect(clients.length).toBeGreaterThan(5); // the scan really found the client files
  });

  it("the server-only files refuse to load in a browser", () => {
    for (const f of ["lib/server/supabase-admin.ts", "lib/server/nightly-supabase.ts", "lib/server/nightly-handler.ts"]) {
      expect(readFileSync(path.join(ROOT, f), "utf8")).toContain('typeof window !== "undefined"');
    }
  });
});
