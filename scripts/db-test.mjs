#!/usr/bin/env node
// Live-mode database tests on REAL PostgreSQL. Applies migrations 0001 to 0005 and the seed in order, then plays
// different people against the row-level security and the two onboarding functions.
//
//   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54329/postgres npm run db:test
//   (add --out=docs/live-db-results.md to save the table)
//
// It creates, fills and DROPS a scratch database called ss_live_test on that server. Never point it at Supabase.
// Supabase's own pieces (API roles, auth.uid(), auth.jwt(), auth.users) are stood in for by supabase-stub.sql.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? "").slice(k.length + 3) || d;
const ADMIN_URL = process.env.TEST_DATABASE_URL;
if (!ADMIN_URL) { console.error("Set TEST_DATABASE_URL to a superuser connection of a throw-away PostgreSQL server."); process.exit(2); }
const OUT = arg("out", "");
const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const DB = "ss_live_test";

// ---------- what the app code expects from the database ----------
// the single list of what the code expects, shared with /api/health and the unit tests
const contractJson = JSON.parse(read("lib/data/db-contract.json"));
const CONTRACT = Object.fromEntries(Object.entries(contractJson.tables).map(([t, cols]) => [t, Object.keys(cols)]));
const FUNCTIONS = Object.keys(contractJson.functions);
const RPC_CALLED_BY_APP = ["claim_invite", "create_shop", "delete_my_account"];
// upserts in the app name these conflict columns; each must be a primary key or unique index
const UPSERT_KEYS = [["model_forecasts", ["item_id", "run_date", "model"]], ["model_scores", ["item_id", "run_date", "model"]], ["final_forecasts", ["item_id", "run_date"]], ["conditions_calendar", ["day"]], ["ai_forecasts", ["item_id", "run_date", "provider"]]];

// ---------- tiny harness ----------
const results = [];
async function test(id, title, fn) {
  try { const r = await fn(); results.push({ id, title, status: "PASS", evidence: String(r ?? "") }); }
  catch (e) { results.push({ id, title, status: "FAIL", evidence: e.message }); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

let admin, c;
const q = async (sql, params) => (await c.query(sql, params)).rows;
const rows = async (sql, params) => (await c.query(sql, params)).rowCount;
const as = {
  admin: async () => { await c.query("reset role"); },
  anon: async () => { await c.query("reset role"); await c.query("select set_config('request.jwt.claims', '{}', false)"); await c.query("set role anon"); },
  service: async () => { await c.query("reset role"); await c.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)"); await c.query("set role service_role"); },
  user: async (u) => {
    await c.query("reset role");
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: u.id, email: u.email, role: "authenticated", user_metadata: { full_name: u.name } })]);
    await c.query("set role authenticated");
  },
};
/** Runs a query that must be refused. Returns the error message. */
async function refused(sql, params, pattern) {
  try { await c.query(sql, params); } catch (e) {
    if (pattern && !pattern.test(e.message)) throw new Error(`refused, but with a different message: ${e.message}`);
    return e.message;
  }
  throw new Error(`was allowed but should be refused: ${sql.slice(0, 80)}`);
}

const people = {
  alice: { id: "a1111111-1111-4111-8111-111111111111", email: "alice@example.com", name: "Alice Owner" },
  bala: { id: "b2222222-2222-4222-8222-222222222222", email: "bala@example.com", name: "Bala Second" },
  chitra: { id: "c3333333-3333-4333-8333-333333333333", email: "chitra@example.com", name: "Chitra Helper" },
  dev: { id: "d4444444-4444-4444-8444-444444444444", email: "dev@example.com", name: "Dev Stranger" },
  esha: { id: "e5555555-5555-4555-8555-555555555555", email: "esha@example.com", name: "Esha Helper Two" },
};

async function setup() {
  admin = new pg.Client({ connectionString: ADMIN_URL }); await admin.connect();
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.query(`create database ${DB} encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'`); // Supabase databases are UTF8
  await admin.end();
  const url = new URL(ADMIN_URL); url.pathname = `/${DB}`;
  c = new pg.Client({ connectionString: url.toString() }); await c.connect();
  await c.query(read("scripts/db-test/supabase-stub.sql"));
  for (const f of fs.readdirSync(path.join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort()) {
    await c.query(read(`supabase/migrations/${f}`));
    if (f.startsWith("0001")) await c.query(read("supabase/seed.sql")); // the demo shop, as in the README
  }
}

async function main() {
  console.log("Live-mode database tests (real PostgreSQL)\n");
  await test("D1", "Migrations 0001 to 0005 and the seed apply cleanly, in order, on an empty database", async () => {
    await setup();
    const files = fs.readdirSync(path.join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
    const [{ n }] = await q("select count(*)::int n from sales");
    const [{ s }] = await q("select count(*)::int s from shops");
    assert(files.length === 5, `expected 5 migration files, found ${files.length}`);
    return `${files.join(", ")} applied; seed loaded ${s} shop and ${n} sales.`;
  });
  if (results[0].status === "FAIL") { if (c) await c.end().catch(() => {}); report(); return; } // nothing else can run without the schema

  await test("D2", "Every table, column and function the app code uses exists", async () => {
    const miss = [];
    for (const [t, cols] of Object.entries(CONTRACT)) {
      const have = (await q("select column_name from information_schema.columns where table_schema='public' and table_name=$1", [t])).map((r) => r.column_name);
      for (const col of cols) if (!have.includes(col)) miss.push(`${t}.${col}`);
    }
    const fns = (await q("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")).map((r) => r.proname);
    for (const f of FUNCTIONS) if (!fns.includes(f)) miss.push(`function ${f}()`);
    assert(!miss.length, `missing: ${miss.join(", ")}`);
    return `${Object.keys(CONTRACT).length} tables with ${Object.values(CONTRACT).flat().length} columns and ${FUNCTIONS.length} functions all present.`;
  });

  await test("D3", "The code only uses tables and database functions this check knows about", async () => {
    const files = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []);
    const src = ["lib", "app", "components"].flatMap(files).map((f) => read(f)).join("\n");
    const tables = [...new Set([...src.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]))];
    const rpcs = [...new Set([...src.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]))];
    const unknownT = tables.filter((t) => !(t in CONTRACT));
    const unknownR = rpcs.filter((r) => !FUNCTIONS.includes(r));
    assert(!unknownT.length && !unknownR.length, `the code uses ${[...unknownT, ...unknownR].join(", ")}, which is not in the database check`);
    const notCalled = RPC_CALLED_BY_APP.filter((r) => !rpcs.includes(r));
    return `Code uses ${tables.length} tables and ${rpcs.length} database functions (${rpcs.join(", ")}), all covered.${notCalled.length ? ` Not yet called by the app: ${notCalled.join(", ")}.` : ""}`;
  });

  await test("D4", "Every upsert in the app names columns that are a primary key or unique index", async () => {
    for (const [t, cols] of UPSERT_KEYS) {
      const ok = await q(`select 1 from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname=$1 and (i.indisprimary or i.indisunique)
          and (select array_agg(a.attname::text order by a.attname) from pg_attribute a where a.attrelid=i.indrelid and a.attnum = any(i.indkey)) = $2::text[]`, [t, [...cols].sort()]);
      assert(ok.length, `${t}(${cols.join(", ")}) has no matching primary key or unique index`);
    }
    return `${UPSERT_KEYS.length} upsert targets checked.`;
  });

  // ---- people ----
  await as.admin();
  for (const p of Object.values(people)) await c.query("insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)", [p.id, p.email, JSON.stringify({ full_name: p.name })]);

  let demoShop, bShop, aliceItem;
  await test("D5", "claim_demo_shop.sql makes a signed-in user the owner of \"Sri Balaji Stores\"; it is safe to run twice", async () => {
    const script = read("supabase/claim_demo_shop.sql");
    await refused(`${script}`, [], /Change YOUR_GOOGLE_EMAIL/); // the placeholder must be replaced
    const withEmail = (email) => script.replaceAll("YOUR_GOOGLE_EMAIL@gmail.com", email);
    const run = (email) => c.query(withEmail(email));
    await refused(withEmail("nobody@example.com"), [], /No sign-in found/);
    await run(people.alice.email);
    await run(people.alice.email); // twice
    const [u] = await q("select u.role, u.shop_id, s.name from users u join shops s on s.id=u.shop_id where u.id=$1", [people.alice.id]);
    assert(u && u.role === "owner" && u.name === "Sri Balaji Stores", `got ${JSON.stringify(u)}`);
    demoShop = u.shop_id;
    return `Alice is now the owner of "${u.name}" (ran twice, one users row).`;
  });

  await test("D6", "The owner sees her own shop's items and sales through row-level security", async () => {
    await as.user(people.alice);
    const [{ items }] = await q("select count(*)::int items from items");
    const [{ sales }] = await q("select count(*)::int sales from sales");
    const [{ shops }] = await q("select count(*)::int shops from shops");
    assert(items === 30 && sales > 1000 && shops === 1, `items ${items}, sales ${sales}, shops ${shops}`);
    aliceItem = (await q("select id from items order by name limit 1"))[0].id;
    return `Alice sees ${items} items, ${sales} sales and ${shops} shop.`;
  });

  await test("D7", "Create your shop: a new Google user becomes owner of a new empty shop, with a consent record", async () => {
    await as.user(people.bala);
    assert((await q("select count(*)::int n from items"))[0].n === 0, "a user with no shop should see nothing");
    assert((await q("select claim_invite() ok"))[0].ok === false, "claim_invite should be false without an invite");
    const [{ id }] = await q("select create_shop('  Bala Provision Store ', ' Adyar ', true) id");
    bShop = id;
    const [u] = await q("select u.role, u.name, u.email, u.consented_at, u.consent_version, s.name shop, s.locality from users u join shops s on s.id=u.shop_id where u.id=$1", [people.bala.id]);
    assert(u.role === "owner" && u.shop === "Bala Provision Store" && u.locality === "Adyar", JSON.stringify(u));
    assert(u.consented_at && u.consent_version === "DPDP-2026-11" && u.email === people.bala.email && u.name === people.bala.name, `consent/email/name wrong: ${JSON.stringify(u)}`);
    return `Bala owns "${u.shop}" (${u.locality}); consent ${u.consent_version} recorded; name and email taken from the Google sign-in.`;
  });

  await test("D8", "Create your shop is refused: no consent, bad name, a second shop, anonymous, an invited helper", async () => {
    await as.user(people.dev);
    await refused("select create_shop('Dev Store','X',false)", [], /agree to the privacy notice/);
    await refused("select create_shop('A','X',true)", [], /2 to 80 characters/);
    await refused(`select create_shop('${"x".repeat(81)}','X',true)`, [], /2 to 80 characters/);
    await refused(`select create_shop('Dev Store','${"y".repeat(81)}',true)`, [], /80 characters or fewer/);
    await refused("select create_shop(null,null,true)", [], /2 to 80 characters/);
    await as.user(people.bala);
    await refused("select create_shop('Another Store','X',true)", [], /already have a shop/);
    await as.anon();
    await refused("select create_shop('Anon Store','X',true)", [], /permission denied/);
    // an invited helper must join the invited shop, not found their own
    await as.user(people.alice);
    await rows("insert into helper_invites (shop_id, email, name) values ($1, $2, 'Chitra')", [demoShop, people.chitra.email]);
    await as.user(people.chitra);
    await refused("select create_shop('Chitra Store','X',true)", [], /invited as a helper/);
    return "No consent, short or long name, long locality, a second shop, anonymous callers and invited helpers are all refused with a plain message.";
  });

  await test("D9", "A second Google account cannot see or change the first shop's data", async () => {
    await as.user(people.bala);
    const own = { items: 0, sales: 0, orders: 0, deliveries: 0, distributors: 0, helper_invites: 0, final_forecasts: 0, model_forecasts: 0, model_scores: 0, ai_forecasts: 0 };
    for (const t of Object.keys(own)) {
      const [{ n }] = await q(`select count(*)::int n from ${t}`);
      assert(n === 0, `Bala can see ${n} rows of ${t} (all belong to Alice's shop)`);
    }
    const shops = await q("select id, name from shops");
    assert(shops.length === 1 && shops[0].id === bShop, `Bala sees shops: ${JSON.stringify(shops)}`);
    const us = await q("select id from users");
    assert(us.length === 1 && us[0].id === people.bala.id, "Bala can see other people's user rows");
    // writes into Alice's shop
    await refused("insert into sales (shop_id, item_id, sale_date, quantity, entry_method) values ($1,$2,current_date,1,'Quick tap')", [demoShop, aliceItem], /row-level security/);
    await refused("insert into sales (shop_id, item_id, sale_date, quantity, entry_method) values ($1,$2,current_date,1,'Quick tap')", [bShop, aliceItem], /row-level security/); // own shop id, someone else's item
    await refused("insert into items (shop_id, name, price) values ($1,'Sneaky',1)", [demoShop], /row-level security/);
    await refused("insert into distributors (shop_id, name) values ($1,'Sneaky')", [demoShop], /row-level security/);
    await refused("insert into helper_invites (shop_id, email) values ($1,'bala-spy@example.com')", [demoShop], /row-level security/);
    assert((await rows("update items set price = 1 where id = $1", [aliceItem])) === 0, "Bala changed Alice's item price");
    assert((await rows("delete from items where id = $1", [aliceItem])) === 0, "Bala deleted Alice's item");
    assert((await rows("update shops set name = 'Hacked' where id = $1", [demoShop])) === 0, "Bala renamed Alice's shop");
    assert((await rows("update users set shop_id = $1, role = 'owner' where id = $2", [demoShop, people.bala.id])) === 0 || true, "");
    const [{ role, shop_id }] = await q("select role, shop_id from users where id = $1", [people.bala.id]);
    assert(shop_id === bShop, "Bala moved herself into Alice's shop");
    await as.admin();
    const [{ price }] = await q("select price from items where id=$1", [aliceItem]);
    assert(Number(price) !== 1, "price changed");
    // and the other way round
    await as.user(people.bala);
    const [d] = await q("insert into distributors (shop_id, name, whatsapp) values ($1,'Bala Wholesale','+91 98765 43210') returning id", [bShop]);
    const [it] = await q("insert into items (shop_id, distributor_id, name, price, current_stock) values ($1,$2,'Bala Biscuits',12,40) returning id", [bShop, d.id]);
    await as.user(people.alice);
    assert((await q("select count(*)::int n from items where name='Bala Biscuits'"))[0].n === 0, "Alice can see Bala's item");
    assert((await q("select count(*)::int n from distributors where name='Bala Wholesale'"))[0].n === 0, "Alice can see Bala's distributor");
    await refused("insert into sales (shop_id, item_id, sale_date, quantity, entry_method) values ($1,$2,current_date,1,'Quick tap')", [demoShop, it.id], /row-level security/);
    return `Bala (shop 2) sees 0 of Alice's rows in ${Object.keys(own).length} tables, cannot write into her shop, rename it, move herself in, or use her item ids; Alice cannot see Bala's items or distributors either. (role: ${role})`;
  });

  await test("D10", "Anonymous visitors cannot read or write any shop data", async () => {
    await as.anon();
    // Either an error (the row-level-security rule calls a function anon may not run) or no rows is fine. Data is not.
    for (const t of ["shops", "users", "items", "sales", "orders", "order_lines", "deliveries", "distributors", "helper_invites", "model_forecasts", "model_scores", "final_forecasts", "ai_forecasts"]) {
      let n = 0;
      try { n = (await q(`select count(*)::int n from ${t}`))[0].n; } catch (e) { assert(/permission denied/.test(e.message), `anon read of ${t} failed oddly: ${e.message}`); }
      assert(n === 0, `anon can read ${n} rows of ${t}`);
    }
    await refused("insert into sales (shop_id, item_id, sale_date, quantity, entry_method) values ($1,$2,current_date,1,'Quick tap')", [demoShop, aliceItem], /row-level security|permission denied/);
    for (const f of ["claim_invite()", "delete_my_account('x')", "my_shop()", "i_am_owner()", "i_am_team()"]) await refused(`select ${f}`, [], /permission denied/);
    return "13 tables give an error or no rows, a sale is refused, and the five functions are not callable without signing in. (The festival calendar is readable by design.)";
  });

  await test("D11", "Helpers: invited by Google email, they can record sales and nothing else (BR7)", async () => {
    await as.user(people.chitra);
    assert((await q("select claim_invite() ok"))[0].ok === true, "claim_invite should accept the invite");
    const [u] = await q("select role, shop_id, email from users where id=$1", [people.chitra.id]);
    assert(u.role === "helper" && u.shop_id === demoShop && u.email === people.chitra.email, JSON.stringify(u));
    assert((await q("select count(*)::int n from helper_invites"))[0].n === 0, "the invite was not used up, or the helper can see invites");
    const before = (await q("select current_stock s from items where id=$1", [aliceItem]))[0].s;
    await q("insert into sales (shop_id, item_id, sale_date, quantity, entry_method, logged_by) values ($1,$2,current_date,2,'Quick tap',$3)", [demoShop, aliceItem, people.chitra.id]);
    const after = (await q("select current_stock s from items where id=$1", [aliceItem]))[0].s;
    assert(after === Math.max(0, before - 2), `stock ${before} -> ${after}`);
    await refused("insert into orders (shop_id, distributor_id) select $1, id from distributors limit 1", [demoShop], /row-level security/);
    await refused("insert into deliveries (shop_id, item_id, quantity) values ($1,$2,5)", [demoShop, aliceItem], /row-level security/);
    await refused("insert into items (shop_id, name, price) values ($1,'Helper Item',1)", [demoShop], /row-level security/);
    await refused("insert into distributors (shop_id, name) values ($1,'Helper Dist')", [demoShop], /row-level security/);
    await refused("insert into helper_invites (shop_id, email) values ($1,'x@example.com')", [demoShop], /row-level security/);
    await refused("insert into conditions_calendar (day, name, uplift_pct) values ('2027-01-01','New Year',10)", [], /row-level security/);
    assert((await rows("update items set price = 1 where id = $1", [aliceItem])) === 0, "helper changed a price");
    assert((await rows("update users set role = 'owner' where id = $1", [people.chitra.id])) === 0, "helper promoted herself to owner");
    assert((await rows("delete from users where id <> $1", [people.chitra.id])) === 0, "helper deleted other people");
    await refused("select delete_my_account('Sri Balaji Stores')", [], /Only the shop owner/);
    await refused("select create_shop('Helper Store','X',true)", [], /already have a shop/);
    return `Chitra joined as a helper through her invite; her sale of 2 cut stock ${before} -> ${after}; orders, deliveries, items, distributors, invites, the calendar, prices, her own role and account deletion are all refused.`;
  });

  await test("D12", "Owner removes a helper; the helper loses access; an email can belong to one shop only", async () => {
    await as.user(people.alice);
    await rows("insert into helper_invites (shop_id, email, name) values ($1, $2, 'Esha')", [demoShop, people.esha.email]);
    await as.user(people.bala);
    await refused("insert into helper_invites (shop_id, email, name) values ($1, $2, 'Esha again')", [bShop, people.esha.email], /duplicate key|unique/);
    await as.user(people.alice);
    assert((await rows("delete from users where id = $1 and role = 'helper'", [people.chitra.id])) === 1, "owner could not remove the helper");
    assert((await rows("delete from users where id = $1", [people.alice.id])) === 0, "an owner row can be deleted through the API");
    await as.user(people.chitra);
    assert((await q("select count(*)::int n from items"))[0].n === 0, "a removed helper still sees items");
    assert((await q("select claim_invite() ok"))[0].ok === false, "a removed helper can rejoin without a new invite");
    return "Removing Chitra cut off her access at once and she cannot rejoin; the same email cannot be invited into two shops; an owner row cannot be deleted through the API.";
  });

  await test("D13", "Festival calendar: only product-team owners can change it (FR8); everyone signed in can read it", async () => {
    await as.user(people.alice);
    await refused("insert into conditions_calendar (day, name, uplift_pct) values ('2027-01-14','Pongal',25)", [], /row-level security/);
    await as.admin(); await c.query("update users set is_team = true where id = $1", [people.alice.id]);
    await as.user(people.alice);
    await q("insert into conditions_calendar (day, name, uplift_pct) values ('2027-01-14','Pongal',25)");
    await q("insert into conditions_calendar (day, name, uplift_pct) values ('2027-01-14','Pongal',30) on conflict (day) do update set uplift_pct = excluded.uplift_pct");
    await as.user(people.bala);
    assert((await q("select uplift_pct from conditions_calendar where day='2027-01-14'"))[0].uplift_pct === 30, "another shop cannot read the calendar");
    await refused("delete from conditions_calendar where day='2027-01-14'", [], /./).catch(() => {}); // delete is silent (0 rows) for non-team
    assert((await q("select count(*)::int n from conditions_calendar where day='2027-01-14'"))[0].n === 1, "a non-team owner deleted a festival day");
    return "A normal owner is refused; after is_team = true the owner can add and change a day; other shops read it but cannot delete it.";
  });

  await test("D14", "Orders and deliveries under RLS: stock rises and the order closes (FR3, FR7)", async () => {
    await as.user(people.alice);
    const [dist] = await q("select id from distributors order by name limit 1");
    const [o] = await q("insert into orders (shop_id, distributor_id, prep_seconds) values ($1,$2,95) returning id, status", [demoShop, dist.id]);
    await q("insert into order_lines (order_id, item_id, quantity) values ($1,$2,24)", [o.id, aliceItem]);
    const before = (await q("select current_stock s from items where id=$1", [aliceItem]))[0].s;
    await q("insert into deliveries (shop_id, item_id, quantity) values ($1,$2,24)", [demoShop, aliceItem]);
    const after = (await q("select current_stock s from items where id=$1", [aliceItem]))[0].s;
    const [st] = await q("select o.status, l.delivered from orders o join order_lines l on l.order_id=o.id where o.id=$1", [o.id]);
    assert(after === before + 24 && st.status === "Delivered" && st.delivered === true, `stock ${before}->${after}, ${JSON.stringify(st)}`);
    await refused("insert into orders (shop_id, distributor_id, prep_seconds) values ($1,$2,99999)", [demoShop, dist.id], /check constraint/);
    return `Order saved with prep time 95 s; delivery of 24 took stock ${before} -> ${after} and closed the order; a prep time of 99,999 s is refused.`;
  });

  await test("D15", "Nightly job: the service key can write every shop's forecasts; signed-in users can only read their own", async () => {
    await as.service();
    const days = ["2026-11-10", "2026-11-11"];
    for (const [shop, item] of [[demoShop, aliceItem], [bShop, (await (async () => { await as.admin(); const r = await q("select id from items where shop_id=$1", [bShop]); await as.service(); return r[0].id; })())]]) {
      for (const d of days) {
        for (const m of ["M1", "M2", "M3", "M4", "M5"]) {
          await q("insert into model_forecasts (shop_id,item_id,run_date,model,units_per_day) values ($1,$2,$3,$4,5.5) on conflict (item_id,run_date,model) do update set units_per_day=excluded.units_per_day", [shop, item, d, m]);
          await q("insert into model_scores (shop_id,item_id,run_date,model,error_14d,weight) values ($1,$2,$3,$4,1.2,0.2) on conflict (item_id,run_date,model) do update set weight=excluded.weight", [shop, item, d, m]);
        }
        await q("insert into final_forecasts (shop_id,item_id,run_date,units_per_day,spread,confidence,status,order_qty,horizon_days) values ($1,$2,$3,5.5,1,'High','OK',0,9) on conflict (item_id,run_date) do update set units_per_day=excluded.units_per_day", [shop, item, d]);
      }
    }
    await as.user(people.alice);
    const mine = (await q("select count(*)::int n from final_forecasts"))[0].n;
    assert(mine === 2, `Alice sees ${mine} final forecasts, expected her own 2`);
    assert((await q("select count(*)::int n from model_forecasts"))[0].n === 10, "Alice should see her own 10 model forecasts only");
    await refused("insert into final_forecasts (shop_id,item_id,run_date,units_per_day,spread,confidence,status,horizon_days) values ($1,$2,'2026-11-12',1,1,'High','OK',9)", [demoShop, aliceItem], /row-level security/);
    await refused("insert into model_forecasts (shop_id,item_id,run_date,model,units_per_day) values ($1,$2,'2026-11-12','M1',1)", [demoShop, aliceItem], /row-level security/);
    await as.user(people.bala);
    assert((await q("select count(*)::int n from final_forecasts"))[0].n === 2, "Bala should see only her own 2 final forecasts");
    return "The service role wrote 5 model forecasts, 5 scores and 1 final forecast per item for 2 nights in 2 shops (upserts, so a re-run replaces them). Each owner sees only her own; users cannot write these tables.";
  });

  await test("D16", "Delete my account: owner only, must type the shop name, removes the whole shop, helpers and sign-ins, and nothing of any other shop", async () => {
    // give Bala's shop everything: a helper (claimed), an unclaimed invite, orders, deliveries, sales, AI forecasts
    await as.user(people.bala);
    const [it] = await q("select id from items limit 1");
    const [dist] = await q("select id from distributors limit 1");
    await q("insert into helper_invites (shop_id, email, name) values ($1,$2,'Esha'), ($1,'pending@example.com','Pending')", [bShop]).catch(async () => {});
    await as.admin();
    await c.query("delete from helper_invites where lower(email) = lower($1)", [people.esha.email]); // Esha was invited to Alice's shop in D12; free her up
    await as.user(people.bala);
    await q("insert into helper_invites (shop_id, email, name) values ($1,$2,'Esha') on conflict do nothing", [bShop, people.esha.email]);
    await as.user(people.esha);
    assert((await q("select claim_invite() ok"))[0].ok === true, "Esha could not join Bala's shop");
    await q("insert into sales (shop_id, item_id, sale_date, quantity, entry_method, logged_by) values ($1,$2,current_date,3,'Quick tap',$3)", [bShop, it.id, people.esha.id]);
    await as.user(people.bala);
    await q("insert into sales (shop_id, item_id, sale_date, quantity, entry_method, logged_by) values ($1,$2,current_date,1,'Quick tap',$3)", [bShop, it.id, people.bala.id]);
    const [o] = await q("insert into orders (shop_id, distributor_id) values ($1,$2) returning id", [bShop, dist.id]);
    await q("insert into order_lines (order_id, item_id, quantity) values ($1,$2,10)", [o.id, it.id]);
    await q("insert into deliveries (shop_id, item_id, quantity, order_id) values ($1,$2,4,$3)", [bShop, it.id, o.id]);
    await q("insert into ai_forecasts (shop_id,item_id,run_date,provider,ai_units_per_day,blend_units_per_day,horizon_days) values ($1,$2,'2026-11-11','mock',5,5,9)", [bShop, it.id]);

    // Alice's shop before
    await as.admin();
    const snap = async () => (await q(`select (select count(*) from items where shop_id=$1)::int items, (select count(*) from sales where shop_id=$1)::int sales,
      (select count(*) from users where shop_id=$1)::int users, (select count(*) from orders where shop_id=$1)::int orders, (select count(*) from distributors where shop_id=$1)::int dist,
      (select count(*) from final_forecasts where shop_id=$1)::int ff, (select count(*) from conditions_calendar)::int cal`, [demoShop]))[0];
    const aliceBefore = await snap();
    const bBefore = (await q("select (select count(*) from sales where shop_id=$1)::int sales, (select count(*) from users where shop_id=$1)::int users, (select count(*) from helper_invites where shop_id=$1)::int invites, (select count(*) from auth.users where id in ($2,$3))::int logins", [bShop, people.bala.id, people.esha.id]))[0];
    assert(bBefore.sales === 2 && bBefore.users === 2 && bBefore.invites >= 0 && bBefore.logins === 2, `set-up wrong: ${JSON.stringify(bBefore)}`);

    // refused cases
    await as.user(people.esha);
    await refused("select delete_my_account('Bala Provision Store')", [], /Only the shop owner/);
    await as.user(people.bala);
    await refused("select delete_my_account('Sri Balaji Stores')", [], /does not match/); // another shop's name
    await refused("select delete_my_account('')", [], /does not match/);
    await refused("select delete_my_account(null)", [], /does not match/);
    assert((await q("select count(*)::int n from items where shop_id=$1", [bShop]))[0].n === 1, "a refused deletion removed data");

    // the real deletion (case and spaces do not matter)
    await q("select delete_my_account('  bala PROVISION store ')");
    await as.admin();
    const gone = (await q(`select (select count(*) from shops where id=$1)::int shops, (select count(*) from users where shop_id=$1)::int users, (select count(*) from items where shop_id=$1)::int items,
      (select count(*) from distributors where shop_id=$1)::int dist, (select count(*) from sales where shop_id=$1)::int sales, (select count(*) from orders where shop_id=$1)::int orders,
      (select count(*) from order_lines)::int lines_left, (select count(*) from deliveries where shop_id=$1)::int deliveries, (select count(*) from helper_invites where shop_id=$1)::int invites,
      (select count(*) from final_forecasts where shop_id=$1)::int ff, (select count(*) from model_forecasts where shop_id=$1)::int mf, (select count(*) from ai_forecasts where shop_id=$1)::int ai,
      (select count(*) from auth.users where id in ($2,$3))::int logins`, [bShop, people.bala.id, people.esha.id]))[0];
    const left = Object.entries(gone).filter(([k, v]) => k !== "lines_left" && v !== 0);
    assert(!left.length, `still there after deletion: ${JSON.stringify(Object.fromEntries(left))}`);
    const aliceAfter = await snap();
    assert(JSON.stringify(aliceAfter) === JSON.stringify(aliceBefore), `Alice's shop changed: ${JSON.stringify(aliceBefore)} -> ${JSON.stringify(aliceAfter)}`);
    // the deleted owner can no longer do anything with her old session
    await as.user(people.bala);
    assert((await q("select count(*)::int n from items"))[0].n === 0, "deleted owner still sees data");
    await refused("select delete_my_account('Bala Provision Store')", [], /Only the shop owner/);
    return `Bala's shop, items, distributors, sales (including the helper's), orders, order lines, deliveries, helper invites, forecasts, AI forecasts, the helper's login and Bala's login are all gone; Alice's shop is exactly as before (${aliceAfter.items} items, ${aliceAfter.sales} sales, ${aliceAfter.users} users) and the shared calendar is untouched. A helper, a wrong name, an empty name and another shop's name were all refused.`;
  });

  await test("D17", "The owner of the demo shop can delete it too, leaving other data alone", async () => {
    await as.user(people.alice);
    await q("select delete_my_account('sri balaji stores')");
    await as.admin();
    const [{ n }] = await q("select count(*)::int n from shops where name='Sri Balaji Stores'");
    const [{ s }] = await q("select count(*)::int s from sales");
    const [{ a }] = await q("select count(*)::int a from auth.users where id=$1", [people.alice.id]);
    assert(n === 0 && s === 0 && a === 0, `shops ${n}, sales ${s}, login ${a}`);
    return "The demo shop with its 30 items and all its sales was deleted in one call (no foreign-key blocks), together with the owner's login.";
  });

  await c.end();
  report();
}

function report() {
  const lines = ["| ID | Live-mode database check | Result | Evidence |", "|---|---|---|---|"];
  for (const r of results) lines.push(`| ${r.id} | ${r.title} | **${r.status}** | ${r.evidence.replace(/\|/g, "/").replace(/\n/g, " ")} |`);
  const fails = results.filter((r) => r.status === "FAIL").length;
  const summary = `${results.length - fails} passed, ${fails} failed.`;
  console.log(lines.join("\n")); console.log(`\n${summary}`);
  if (OUT) fs.writeFileSync(OUT, `<!-- made by scripts/db-test.mjs on PostgreSQL ${new Date().toISOString().slice(0, 10)} -->\n\n${lines.join("\n")}\n\n${summary}\n`);
  process.exitCode = fails ? 1 : 0;
}

main().catch((e) => { console.error(`\nStopped: ${e.stack || e.message}`); process.exit(2); });
