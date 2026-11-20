import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import raw from "@/lib/data/demo-data.json";

// B15 (UAT): the demo distributors' salesmen must look clearly invented, so nobody takes them for real people.
describe("demo salesman names are clearly made up", () => {
  it("every salesman in the demo data ends with (demo)", () => {
    expect(raw.distributors.length).toBeGreaterThan(0);
    for (const d of raw.distributors) expect(d.salesman, d.name).toMatch(/ \(demo\)$/);
  });
  it("every salesman in supabase/seed.sql ends with (demo) too, so a fresh seed matches", () => {
    const seed = readFileSync(path.resolve(import.meta.dirname, "../supabase/seed.sql"), "utf8");
    const rows = [...seed.matchAll(/insert into distributors \([^)]*\) values \('[^']*', '[^']*', '([^']*)', '([^']*)', '([^']*)', '\+91/g)];
    expect(rows.length).toBe(raw.distributors.length);
    for (const m of rows) expect(m[3], m[1]).toMatch(/ \(demo\)$/);
    // the same people in both places, in the same order
    expect(rows.map((m) => m[3])).toEqual(raw.distributors.map((d) => d.salesman));
  });
  it("none of the old, real-looking names is left", () => {
    const all = readFileSync(path.resolve(import.meta.dirname, "../supabase/seed.sql"), "utf8") + JSON.stringify(raw.distributors);
    for (const n of ["Ramesh", "Imran"]) expect(all).not.toContain(n);
  });
});
