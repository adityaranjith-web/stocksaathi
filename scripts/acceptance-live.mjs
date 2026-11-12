#!/usr/bin/env node
// Acceptance checks for LIVE mode (real Supabase + Google sign-in), run over HTTP against a running app.
//
//   node scripts/acceptance-live.mjs --base=https://your-site.vercel.app [--out=docs/live-http-results.md]
//
// Without any sign-in it checks everything a signed-out visitor can reach: the set-up self-check, the sign-in wall,
// the nightly route, and that nothing leaks.
//
// With real sign-ins it also checks a signed-in owner, a SECOND Google account that must not see the first shop's
// data, and a helper. Sign in with each account in a normal browser, then copy the request's "Cookie" header
// (DevTools, Network tab, any page request, Request Headers) into an environment variable. They are your logins:
// keep them in your own terminal, never paste them into chat or a file.
//   PowerShell:  $env:ACCEPT_OWNER_COOKIE = "<cookie header>"   (and ACCEPT_OTHER_COOKIE, ACCEPT_HELPER_COOKIE)
//
// It only reads, except one write that must FAIL: the second account tries to record a sale on the first shop's item.
import fs from "node:fs";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? "").slice(k.length + 3) || d;
const BASE = arg("base", process.env.BASE_URL || "").replace(/\/$/, "");
const OUT = arg("out", "");
if (!BASE) { console.error("Give the app address: --base=https://your-site.vercel.app"); process.exit(2); }
const COOKIE = { owner: process.env.ACCEPT_OWNER_COOKIE, other: process.env.ACCEPT_OTHER_COOKIE, helper: process.env.ACCEPT_HELPER_COOKIE };

const results = [];
class Skip extends Error {}
const assert = (c, m) => { if (!c) throw new Error(m); };
async function test(id, title, fn) {
  try { results.push({ id, title, status: "PASS", evidence: String((await fn()) ?? "") }); }
  catch (e) { results.push({ id, title, status: e instanceof Skip ? "SKIPPED" : "FAIL", evidence: e.message }); }
}
const needs = (who) => { if (!COOKIE[who]) throw new Skip(`not run: set ACCEPT_${who.toUpperCase()}_COOKIE`); };

async function http(method, path, { cookie, body, headers } = {}) {
  const res = await fetch(BASE + path, {
    method, redirect: "manual",
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, text: await res.text(), location: res.headers.get("location") ?? "" };
}
const plain = (h) => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ")
  .replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const goesToLogin = (r) => r.status >= 300 && r.status < 400 && /\/login/.test(r.location);

async function main() {
  console.log(`Live-mode acceptance against ${BASE}\n`);

  await test("L1", "The set-up self-check says the database is complete and the public settings are present", async () => {
    const r = await http("GET", "/api/health");
    assert(r.status === 200, `/api/health answered ${r.status}`);
    const j = JSON.parse(r.text);
    assert(j.mode === "live", `the app is in ${j.mode} mode: the Supabase settings are not set on this deployment`);
    assert(j.env.NEXT_PUBLIC_SUPABASE_URL && j.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing on this deployment");
    assert(j.ok, `${j.next} Missing: ${j.missing.map((m) => `${m.what} (${m.migration})`).join(", ") || "none"}. Problems: ${j.problems.join("; ") || "none"}`);
    return `ok. Nightly-job settings present: service key ${j.env.SUPABASE_SERVICE_ROLE_KEY}, cron secret ${j.env.CRON_SECRET}.`;
  });

  await test("L2", "Signed out: every screen and every write sends the visitor to the sign-in page", async () => {
    for (const p of ["/", "/sell", "/reorder", "/deliveries", "/more", "/scorecard", "/stock", "/setup/items", "/setup/helpers", "/setup/account", "/onboarding", "/ai"]) {
      const r = await http("GET", p); assert(goesToLogin(r), `${p} answered ${r.status} ${r.location} instead of a redirect to /login`);
    }
    for (const [m, p] of [["POST", "/api/sales"], ["POST", "/api/orders"], ["POST", "/api/deliveries"], ["POST", "/api/items"], ["POST", "/api/helpers"], ["POST", "/api/onboarding"], ["DELETE", "/api/account"], ["POST", "/api/upload"]]) {
      const r = await http(m, p, { body: {} }); assert(r.status !== 200 && r.status !== 400, `${m} ${p} answered ${r.status} without a sign-in`);
    }
    return "12 screens and 8 write routes all refuse a visitor who is not signed in.";
  });

  await test("L3", "The sign-in page works and offers Google", async () => {
    const r = await http("GET", "/login");
    assert(r.status === 200 && /Sign in with Google/.test(r.text), `/login answered ${r.status}`);
    return "The sign-in page opens with a Sign in with Google button.";
  });

  await test("L4", "The nightly route is shut without the secret", async () => {
    for (const h of [{}, { Authorization: "Bearer wrong-secret-wrong-secret" }]) {
      const r = await http("GET", "/api/cron/nightly", { headers: h });
      assert(r.status === 401 || r.status === 503, `/api/cron/nightly answered ${r.status} without the right secret`);
    }
    return "No header and a wrong secret are both refused (401, or 503 if CRON_SECRET is not set).";
  });

  await test("L5", "Nothing public leaks a key", async () => {
    for (const p of ["/api/health", "/login"]) {
      const r = await http("GET", p);
      assert(!/service_role|sb_secret_|SUPABASE_SERVICE_ROLE_KEY=/.test(r.text), `${p} contains a secret key name or value`);
    }
    const h = await http("GET", "/api/health");
    assert(!/eyJ[A-Za-z0-9_-]{30,}\./.test(h.text), "/api/health contains a token");
    return "The health check and the sign-in page contain no secret key names or tokens.";
  });

  // ---------- with real sign-ins ----------
  let ownerItems = [];
  await test("O1", "Signed-in owner: the screens open and show the shop's items", async () => {
    needs("owner");
    for (const p of ["/", "/sell", "/reorder", "/deliveries", "/more", "/scorecard", "/stock", "/setup/items", "/setup/account"]) {
      const r = await http("GET", p, { cookie: COOKIE.owner }); assert(r.status === 200, `owner opening ${p} got ${r.status} ${r.location}`);
    }
    const list = await http("GET", "/setup/items", { cookie: COOKIE.owner });
    ownerItems = [...list.text.matchAll(/href="\/setup\/items\/([0-9a-f-]{36})"/g)].map((m) => m[1]);
    assert(ownerItems.length > 0, "the owner's item list is empty (is this the Sri Balaji Stores account?)");
    return `9 screens open; the owner has ${ownerItems.length} items.`;
  });

  await test("X1", "A second Google account does not see the first shop's items, sales or orders", async () => {
    needs("owner"); needs("other");
    // item names, read from the owner's Items screen: the first text inside each item's link
    const list = await http("GET", "/setup/items", { cookie: COOKIE.owner });
    const names = new Set(list.text.split('href="/setup/items/').slice(1).map((chunk) => chunk.match(/font-semibold">([^<]+)</)?.[1]?.trim()).filter((n) => n && n.length > 3));
    const sample = [...names].slice(0, 25);
    assert(sample.length >= 5, "could not read enough item names from the owner's list");
    for (const p of ["/", "/sell", "/reorder", "/stock", "/setup/items", "/setup/distributors", "/deliveries", "/scorecard"]) {
      const r = await http("GET", p, { cookie: COOKIE.other });
      if (goesToLogin(r)) throw new Error(`the second account is signed out (cookie expired?) on ${p}`);
      const text = plain(r.text);
      const leaked = sample.filter((n) => text.includes(n));
      assert(leaked.length === 0, `the second account's ${p} shows the first shop's items: ${leaked.slice(0, 3).join(", ")}`);
    }
    return `Checked 8 screens of the second account against ${sample.length} item names of the first shop: none appear. (Second account is ${(await http("GET", "/", { cookie: COOKIE.other })).location.includes("onboarding") ? "waiting at Create your shop" : "in its own shop"}.)`;
  });

  await test("X2", "The second account cannot read, record sales on, or change the first shop's items", async () => {
    needs("owner"); needs("other");
    assert(ownerItems.length, "run the owner check first (it reads the item ids)");
    const id = ownerItems[0];
    const stock = async () => plain((await http("GET", `/setup/items/${id}`, { cookie: COOKIE.owner })).text).match(/(\d+) in stock now/)?.[1];
    const before = await stock();
    const page = await http("GET", `/item/${id}`, { cookie: COOKIE.other });
    assert(page.status !== 200, `the second account opened the first shop's item page (${page.status})`);
    const sale = await http("POST", "/api/sales", { cookie: COOKIE.other, body: { itemId: id, qty: 1 } });
    assert(sale.status !== 200, "the second account recorded a sale on the first shop's item");
    const edit = await http("PUT", "/api/items", { cookie: COOKIE.other, body: { id, name: "Hacked", price: "1", distributorId: id, leadTimeDays: "1", minSafetyStock: "1", orderCoverDays: "1" } });
    assert(edit.status !== 200, "the second account changed the first shop's item");
    assert((await stock()) === before, "the first shop's stock changed");
    return `Item page ${page.status}, sale ${sale.status}, edit ${edit.status}: all refused. The first shop's stock stayed at ${before}.`;
  });

  await test("H1", "A helper sees only the Sell screen and no prices", async () => {
    needs("helper");
    for (const p of ["/", "/reorder", "/deliveries", "/more", "/scorecard", "/stock", "/setup/items", "/setup/account"]) {
      const r = await http("GET", p, { cookie: COOKIE.helper }); assert(r.status === 307 && /\/sell$/.test(r.location), `helper opening ${p}: ${r.status} ${r.location}`);
    }
    for (const [m, p, b] of [["POST", "/api/orders", { distributorId: "x", lines: [{ itemId: "x", qty: 1 }] }], ["POST", "/api/deliveries", { itemId: "x", qty: 1 }], ["POST", "/api/items", {}], ["POST", "/api/helpers", { email: "a@b.co" }], ["DELETE", "/api/account", { confirm: "x" }]]) {
      const r = await http(m, p, { cookie: COOKIE.helper, body: b }); assert(r.status === 403, `helper ${m} ${p} answered ${r.status}, expected 403`);
    }
    const sell = await http("GET", "/sell", { cookie: COOKIE.helper });
    assert(sell.status === 200 && !/₹\s?\d/.test(plain(sell.text)), "the helper's Sell screen is not open or shows prices");
    return "8 owner screens redirect to Sell, 5 owner actions answer 403, and the Sell screen shows no prices.";
  });

  report();
}

function report() {
  const lines = ["| ID | Live-mode check | Result | Evidence |", "|---|---|---|---|"];
  for (const r of results) lines.push(`| ${r.id} | ${r.title} | **${r.status}** | ${r.evidence.replace(/\|/g, "/").replace(/\n/g, " ")} |`);
  const c = (s) => results.filter((r) => r.status === s).length;
  const summary = `${c("PASS")} passed, ${c("FAIL")} failed, ${c("SKIPPED")} skipped (need a signed-in cookie).`;
  console.log(lines.join("\n")); console.log(`\n${summary}`);
  if (OUT) fs.writeFileSync(OUT, `<!-- made by scripts/acceptance-live.mjs against ${BASE} on ${new Date().toISOString().slice(0, 10)} -->\n\n${lines.join("\n")}\n\n${summary}\n`);
  process.exitCode = c("FAIL") ? 1 : 0;
}

main().catch((e) => { console.error(`\nStopped: ${e.message}`); process.exit(2); });
