import { createClient } from "@supabase/supabase-js";
import { isLive } from "@/lib/data";
import { settingsPresent } from "@/lib/server/config-check";
import { contract, migrationOfColumn, migrationOfFunction, migrationOfTable, migrationsToRun, type Missing } from "@/lib/db-contract";

// Live-mode self-check. Open /api/health on the site to see whether the set-up is complete.
// It uses only the public anon key. It answers yes or no and names what is missing; it never returns data or any key.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
// What the API says when a table, column or function does not exist
const MISSING_CODES = new Set(["42P01", "42703", "42883", "PGRST200", "PGRST202", "PGRST204", "PGRST205"]);
const isMissing = (e: { code?: string; message?: string } | null) => !!e && (MISSING_CODES.has(e.code ?? "") || /does not exist|could not find/i.test(e.message ?? ""));

// One short network hiccup must not make the check report a fault, so a request that fails to connect is tried once more.
async function retry<T extends { error: { message?: string } | null }>(run: () => PromiseLike<T>): Promise<T> {
  const first = await run();
  return first.error && /fetch failed|network|ECONN|ETIMEDOUT/i.test(first.error.message ?? "") ? await run() : first;
}

export async function GET() {
  const env = settingsPresent(); // yes or no per setting; no values
  if (!isLive) return Response.json({ mode: "demo", note: "Demo mode: no Supabase keys are set, so there is nothing to check.", env }, { headers: NO_STORE });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const missing: Missing[] = [];
  const problems: string[] = [];
  let reachable = true;

  // Tables and columns: one request per table; only if it fails, find which columns are missing.
  for (const [table, cols] of Object.entries(contract.tables)) {
    const names = Object.keys(cols);
    const all = await retry(() => sb.from(table).select(names.join(",")).limit(0));
    if (!all.error) continue;
    if (!isMissing(all.error)) {
      if (all.error.code === "42501") continue; // permission denied for an anonymous visitor: the table exists
      reachable = false; problems.push(`${table}: ${all.error.message}`); continue;
    }
    const tableGone = await retry(() => sb.from(table).select(names[0]).limit(0));
    if (tableGone.error && isMissing(tableGone.error) && /relation|table|schema cache/i.test(tableGone.error.message)) {
      missing.push({ what: `table ${table}`, migration: migrationOfTable(table) });
      continue;
    }
    for (const col of names) {
      const one = await retry(() => sb.from(table).select(col).limit(0));
      if (one.error && isMissing(one.error)) missing.push({ what: `column ${table}.${col}`, migration: migrationOfColumn(table, col) });
    }
  }

  // Functions the app calls. Signed out, an existing one answers "permission denied"; a missing one answers "not found".
  const callable: string[] = [];
  const calls: Record<string, [string, Record<string, unknown> | undefined]> = {
    claim_invite: ["claim_invite", undefined],
    create_shop: ["create_shop", { p_name: "x", p_locality: "x", p_consent: false }],
    delete_my_account: ["delete_my_account", { p_confirm: "x" }],
  };
  for (const [name, [fn, args]] of Object.entries(calls)) {
    const r = await retry(() => sb.rpc(fn, args));
    if (isMissing(r.error)) missing.push({ what: `function ${name}()`, migration: migrationOfFunction(name) });
    else if (!r.error) callable.push(name); // should be impossible: signed-out visitors must not be able to run it
  }

  const ok = reachable && missing.length === 0 && callable.length === 0 && env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Response.json({
    mode: "live", ok, env,
    migrationsToRun: migrationsToRun(missing),
    missing,
    problems,
    signedOutCanCall: callable,
    next: ok
      ? "The database is set up. If sign-in still fails, check the Google and redirect settings in docs/live-setup.md."
      : missing.length ? `Run these migrations in the Supabase SQL editor, in order: ${migrationsToRun(missing).join(", ")}. Then reload this page.` : "See the problems list.",
  }, { headers: NO_STORE });
}
