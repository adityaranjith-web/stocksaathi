import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { contract, migrationOfColumn, migrationOfFunction, migrationOfTable, migrationsToRun } from "./db-contract";

const ROOT = path.resolve(import.meta.dirname, "..");
const dir = path.join(ROOT, "supabase/migrations");
const migrations = readdirSync(dir).filter((n) => n.endsWith(".sql")).sort().map((n) => ({ n: n.slice(0, 4), sql: readFileSync(path.join(dir, n), "utf8") }));

describe("the list of what the app expects from the database matches the migration files", () => {
  it("every column a later migration adds is listed under that migration", () => {
    const added: string[] = [];
    for (const m of migrations) {
      for (const hit of m.sql.matchAll(/alter table (\w+) add column(?: if not exists)? (\w+)/gi)) {
        added.push(`${hit[1]}.${hit[2]}`);
        expect(migrationOfColumn(hit[1], hit[2]), `${hit[1]}.${hit[2]} is added by ${m.n}`).toBe(m.n);
      }
    }
    expect(added.length).toBeGreaterThanOrEqual(6); // 0003 to 0005 add several columns
  });

  it("every table a migration creates is listed, and every listed table is created", () => {
    const created = migrations.flatMap((m) => [...m.sql.matchAll(/create table(?: if not exists)? (\w+)/gi)].map((x) => x[1]));
    expect(created.sort()).toEqual(Object.keys(contract.tables).sort());
  });

  it("every function the app calls is created by the migration the list names", () => {
    for (const [fn, mig] of Object.entries(contract.functions)) {
      const file = migrations.find((m) => m.n === mig)!;
      expect(file.sql, `${fn} should be created in ${mig}`).toMatch(new RegExp(`create (or replace )?function (public\\.)?${fn}\\(`, "i"));
    }
  });

  it("columns created with their table, and used by the app, are listed under the migration that creates the table", () => {
    let checked = 0;
    for (const m of migrations) {
      for (const t of m.sql.matchAll(/create table(?: if not exists)? (\w+) \(([\s\S]*?)\n\);/gi)) {
        for (const line of t[2].split("\n")) {
          const col = line.trim().match(/^(\w+)\s+(uuid|text|int|bigint|numeric|boolean|date|timestamptz)\b/i)?.[1];
          // columns the app never reads (for example created_at) are not in the list
          if (col && contract.tables[t[1]]?.[col] !== undefined) { expect(contract.tables[t[1]][col], `${t[1]}.${col}`).toBe(m.n); checked++; }
        }
      }
    }
    expect(checked).toBeGreaterThan(60);
  });
});

describe("saying which migration to run", () => {
  it("finds the migration for a missing column, table or function", () => {
    expect(migrationOfColumn("users", "is_team")).toBe("0003");
    expect(migrationOfColumn("final_forecasts", "horizon_days")).toBe("0004");
    expect(migrationOfColumn("users", "consented_at")).toBe("0005");
    expect(migrationOfTable("helper_invites")).toBe("0003");
    expect(migrationOfFunction("create_shop")).toBe("0005");
  });
  it("lists each migration once, in order", () => {
    expect(migrationsToRun([{ migration: "0005" }, { migration: "0003" }, { migration: "0003" }, { migration: "0004" }])).toEqual(["0003", "0004", "0005"]);
    expect(migrationsToRun([])).toEqual([]);
  });
});
