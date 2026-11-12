// What the app code expects from the Supabase database, and which migration adds each piece.
// The list itself is in lib/data/db-contract.json. A test checks it against the migration files.
import contractJson from "./data/db-contract.json";

export const contract = contractJson as { tables: Record<string, Record<string, string>>; functions: Record<string, string> };

/** Names the migrations to run, in order, for a list of missing things. */
export function migrationsToRun(missing: { migration: string }[]): string[] {
  return [...new Set(missing.map((m) => m.migration))].sort();
}

export interface Missing { what: string; migration: string }

/** Looks up which migration adds a table column or a function. Unknown things count as 0001. */
export function migrationOfColumn(table: string, column: string): string {
  return contract.tables[table]?.[column] ?? "0001";
}
export function migrationOfFunction(name: string): string {
  return contract.functions[name] ?? "0001";
}

/**
 * The migration that created a whole table: the earliest one that adds any of its columns.
 * (A missing table means all its columns are missing, so the earliest is the one to run.)
 */
export function migrationOfTable(table: string): string {
  return Object.values(contract.tables[table] ?? { x: "0001" }).sort()[0];
}
