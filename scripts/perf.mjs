#!/usr/bin/env node
// Page speed table for LIVE mode: load time and number of database calls for Home, Sell, Reorder, Stock, Why, Scorecard.
// Also saves every reorder quantity and forecast so two runs (before and after a change) can be compared exactly.
//
//   1. Start the app in live mode with the timing log on and its output in a file, e.g. (PowerShell):
//        $env:PERF_LOG="1"; npm start *> server.log
//   2. Give this script a test login (email + password user in the same Supabase project) and the log file:
//        PERF_SUPABASE_URL, PERF_SUPABASE_ANON_KEY (public), PERF_EMAIL, PERF_PASSWORD, PERF_SERVER_LOG=server.log
//        node scripts/perf.mjs --base=http://localhost:3000 --runs=5 --out=docs/perf-after.md --snapshot=perf-after.json
//   Compare two snapshots:  node scripts/perf.mjs --compare=perf-before.json,perf-after.json
//
// "Client ms" is the time this script waits for the page (network + the app). "Server ms" is the app's own render time
// from its [perf] log line. DB calls are the HTTP calls the app makes to Supabase for that page (see lib/perf.ts); the
// middleware adds one sign-in check per page that is not counted.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? "").slice(k.length + 3) || d;

if (arg("compare", "")) {
  const [a, b] = arg("compare", "").split(",").map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
  const keys = new Set([...Object.keys(a.reorder), ...Object.keys(b.reorder)]);
  const diffs = [...keys].filter((k) => a.reorder[k] !== b.reorder[k]).map((k) => `${k}: ${a.reorder[k]} -> ${b.reorder[k]}`);
  const wk = new Set([...Object.keys(a.why), ...Object.keys(b.why)]);
  const wdiffs = [...wk].filter((k) => JSON.stringify(a.why[k]) !== JSON.stringify(b.why[k])).map((k) => `${k}: ${JSON.stringify(a.why[k])} -> ${JSON.stringify(b.why[k])}`);
  console.log(`Reorder quantities: ${keys.size} items on the list, ${diffs.length} differ.`);
  console.log(`Why-this-number (forecast, spread, safety stock, reorder point, status, order): ${wk.size} items, ${wdiffs.length} differ.`);
  [...diffs, ...wdiffs].slice(0, 20).forEach((d) => console.log("  DIFF", d));
  process.exit(diffs.length + wdiffs.length ? 1 : 0);
}

const BASE = arg("base", "http://localhost:3000").replace(/\/$/, "");
const RUNS = +arg("runs", "5");
const OUT = arg("out", "");
const SNAP = arg("snapshot", "");
const LOG = process.env.PERF_SERVER_LOG;
const { PERF_SUPABASE_URL: URL_, PERF_SUPABASE_ANON_KEY: KEY, PERF_EMAIL: EMAIL, PERF_PASSWORD: PASSWORD } = process.env;
if (!URL_ || !KEY || !EMAIL || !PASSWORD) { console.error("Set PERF_SUPABASE_URL, PERF_SUPABASE_ANON_KEY, PERF_EMAIL and PERF_PASSWORD (a test login)."); process.exit(2); }

// ---- sign in and build the cookie the app expects (the @supabase/ssr format) ----
const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (error || !data.session) { console.error(`Sign-in failed: ${error?.message}`); process.exit(2); }
const ref = new globalThis.URL(URL_).hostname.split(".")[0];
const encoded = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
const chunks = encoded.match(/.{1,3000}/g);
const COOKIE = chunks.map((c, i) => `sb-${ref}-auth-token${chunks.length > 1 ? "." + i : ""}=${c}`).join("; ");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchPage(path) {
  // The app's middleware sends a visitor to /login if its own sign-in check to Supabase fails for a moment (a network
  // blip). That is not a page time, so try again a few times.
  for (let attempt = 0; ; attempt++) {
    const t = performance.now();
    const res = await fetch(BASE + path, { headers: { Cookie: COOKIE }, redirect: "manual" });
    const html = await res.text();
    const r = { status: res.status, ms: Math.round(performance.now() - t), html, location: res.headers.get("location") ?? "" };
    if (r.status === 307 && /\/login/.test(r.location) && attempt < 3) { await sleep(700); continue; }
    return r;
  }
}
let logPos = LOG && fs.existsSync(LOG) ? fs.statSync(LOG).size : 0;
async function perfLinesSince() {
  if (!LOG) return [];
  await sleep(250); // the log line is written just after the response is sent
  const text = fs.readFileSync(LOG, "utf8");
  const fresh = Buffer.from(text).subarray(logPos).toString("utf8");
  logPos = Buffer.byteLength(text);
  return [...fresh.matchAll(/\[perf\] (\{.*\})/g)].map((m) => JSON.parse(m[1]));
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const plain = (h) => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

// ---- find an item that is on the reorder list, for the "Why" page ----
const first = await fetchPage("/reorder");
if (first.status !== 200) { console.error(`/reorder answered ${first.status} ${first.location}. Is the test login linked to a shop?`); process.exit(2); }
const reorder = {};
for (const tag of first.html.split('id="dont"')[0].matchAll(/<input[^>]*id="q-([0-9a-f-]{36})"[^>]*>/g)) reorder[tag[1]] = +(tag[0].match(/value="(\d+)"/)?.[1] ?? NaN);
const whyId = Object.keys(reorder)[0];
if (!whyId) { console.error("Nothing is on the reorder list, so there is no Why page to time."); process.exit(2); }

const pages = [["Home", "/"], ["Sell", "/sell"], ["Reorder", "/reorder"], ["Stock", "/stock"], ["Why this number", `/item/${whyId}`], ["Scorecard", "/scorecard"]];
await perfLinesSince(); // skip what is already in the log
const rows = [];
for (const [name, path] of pages) {
  await fetchPage(path); await perfLinesSince(); // one warm-up
  const client = [], server = [], calls = [], trips = [], dbms = [], auth = [], rest = [], rpc = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await fetchPage(path);
    if (r.status !== 200) throw new Error(`${path} answered ${r.status} ${r.location}`);
    client.push(r.ms);
    const lines = (await perfLinesSince()).filter((l) => l.path === path);
    const l = lines[lines.length - 1];
    if (l) { server.push(l.total_ms); calls.push(l.db_calls); trips.push(l.round_trips); dbms.push(l.db_ms); auth.push(l.auth); rest.push(l.rest); rpc.push(l.rpc); }
  }
  rows.push({ name, path, client: median(client), server: server.length ? median(server) : null, calls: calls.length ? median(calls) : null, trips: trips.length ? median(trips) : null, dbms: dbms.length ? median(dbms) : null, auth: auth.length ? median(auth) : null, rest: rest.length ? median(rest) : null, rpc: rpc.length ? median(rpc) : null });
}

const lines = [`| Page | Client ms | Server ms | DB calls in the code | Round trips to Supabase | sign-in | table queries | functions | Round-trip ms added up |`, `|---|---|---|---|---|---|---|---|---|`];
for (const r of rows) lines.push(`| ${r.name} | ${r.client} | ${r.server ?? "–"} | ${r.calls ?? "–"} | ${r.trips ?? "–"} | ${r.auth ?? "–"} | ${r.rest ?? "–"} | ${r.rpc ?? "–"} | ${r.dbms ?? "–"} |`);
const table = lines.join("\n");
console.log(`Page speed against ${BASE} (median of ${RUNS} runs after 1 warm-up)\n\n${table}`);
if (OUT) fs.writeFileSync(OUT, `<!-- made by scripts/perf.mjs on ${new Date().toISOString().slice(0, 10)} against ${BASE}, median of ${RUNS} runs -->\n\n${table}\n`);

// ---- snapshot of every result, to compare before and after ----
if (SNAP) {
  const ids = [...first.html.matchAll(/href="\/item\/([0-9a-f-]{36})"/g)].map((m) => m[1]);
  const setup = await fetchPage("/setup/items");
  const all = [...new Set([...ids, ...[...setup.html.matchAll(/href="\/setup\/items\/([0-9a-f-]{36})"/g)].map((m) => m[1])])];
  const why = {};
  for (const id of all) {
    const t = plain((await fetchPage(`/item/${id}`)).html);
    const g = (re) => t.match(re)?.slice(1).join("|") ?? "";
    why[id] = {
      name: g(/Why this number: (.+?) Sales up to/),
      status: g(/(Reorder today|Don't reorder|OK)\s+(?:Order\s+\d+|No order needed|Do not reorder)/),
      order: g(/Order\s+(\d+)/),
      blended: g(/Blended forecast (\d+\.\d{2})/),
      working: g(/Spread between models = ([\d.]+) units\/day Safety stock = (.*?) Reorder point = (.*?) Stock/),
      models: [...t.matchAll(/\bM([1-5]) [^|]*?\) (-?\d+\.\d{2}) (\d+\.\d{2}) (\d+\.\d)%/g)].map((m) => m.slice(1).join(":")).join(","),
    };
  }
  fs.writeFileSync(SNAP, JSON.stringify({ reorder, why }, null, 1));
  console.log(`\nSaved ${Object.keys(reorder).length} reorder quantities and ${Object.keys(why).length} Why pages to ${SNAP}`);
}
await sb.auth.signOut();
