#!/usr/bin/env node
// Acceptance tests for every FR and BR in the BRD, run against a RUNNING app over HTTP.
//
//   npm run build && npm start            (in one window; demo mode, no Supabase keys)
//   npm run acceptance                    (in another; defaults to http://localhost:3000)
//   node scripts/acceptance.mjs --base=https://your-site.vercel.app --out=docs/acceptance-results-script.md
//
// It uses only the real pages and API routes, plus a few independent re-calculations from the raw demo data, so a
// bug in the app cannot hide behind the same bug in the test. Two checks need a real browser (offline sale queue and
// the WhatsApp link): they are listed at the end and done by hand or in the browser pane.
//
// WARNING: it adds sales, items, deliveries and orders. It only runs against the demo shop (it checks the shop name)
// and you should restart the server afterwards to reset the demo data.
import fs from "node:fs";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? "").slice(k.length + 3) || d;
const BASE = arg("base", process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const OUT = arg("out", "");
const raw = JSON.parse(fs.readFileSync(new URL("../lib/data/demo-data.json", import.meta.url), "utf8"));

// ---------- tiny helpers ----------
const results = [];
class Skip extends Error {} // throw one to mark a check as skipped
const assert = (c, m) => { if (!c) throw new Error(m); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
async function test(id, title, method, fn) {
  try {
    const r = await fn();
    const o = typeof r === "object" && r ? r : { evidence: String(r ?? "") };
    results.push({ id, title, method, status: o.status ?? "PASS", evidence: o.evidence });
  } catch (e) {
    results.push({ id, title, method, status: e instanceof Skip ? "SKIP" : "FAIL", evidence: e.message });
  }
}
const partial = (evidence) => ({ status: "PARTIAL", evidence });

const HELPER = { cookie: "ss_role=helper" };
async function http(method, path, { body, cookie, json = true } = {}) {
  const res = await fetch(BASE + path, {
    method, redirect: "manual",
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined && json ? { "Content-Type": "application/json" } : {}) },
    body: body === undefined ? undefined : json ? JSON.stringify(body) : body,
  });
  const text = await res.text();
  return { status: res.status, text, location: res.headers.get("location") ?? "" };
}
const get = (p, o) => http("GET", p, o);
const post = (p, body, o) => http("POST", p, { ...o, body });

function plain(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ").trim();
}

// India date, written separately from the app's own date code
const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const ASOF = addDays(istToday(), -1);
const SHIFT = daysBetween(raw.lastDataDay, ASOF);
const rawSales = raw.sales.map(([d, id, q]) => ({ date: addDays(d, SHIFT), id, qty: q }));
const nameOf = Object.fromEntries(raw.items.map((i) => [i.id, i.name]));

// ---------- readers for the real screens ----------
const itemIds = async () => [...new Set([...(await get("/setup/items")).text.matchAll(/href="\/setup\/items\/([A-Za-z0-9]+)"/g)].map((m) => m[1]).filter((x) => x !== "new"))];
const stockOf = async (id) => { const m = plain((await get(`/setup/items/${id}`)).text).match(/(\d+) in stock now/); assert(m, `no stock on set-up page of ${id}`); return +m[1]; };
const soldToday = async () => { const m = plain((await get("/")).text).match(/Sold today\s+(\d+)\s+units/); assert(m, "no 'Sold today' on Home"); return +m[1]; };

async function priceMap() {
  const html = (await get("/setup/items")).text;
  const out = {};
  for (const chunk of html.split('href="/setup/items/').slice(1)) {
    const id = chunk.match(/^([A-Za-z0-9]+)"/)?.[1];
    const price = plain(chunk.split("</a>")[0]).match(/₹\s?(\d+(?:\.\d+)?)/)?.[1];
    if (id && price) out[id] = +price;
  }
  return out;
}

async function reorderPage() {
  const html = (await get("/reorder")).text;
  const cut = html.indexOf('id="dont"');
  const top = cut > 0 ? html.slice(0, cut) : html;
  const lines = {};
  for (const tag of top.matchAll(/<input[^>]*id="q-([A-Za-z0-9]+)"[^>]*>/g)) lines[tag[1]] = +(tag[0].match(/value="(\d+)"/)?.[1] ?? NaN);
  const dont = cut > 0 ? [...new Set([...html.slice(cut).matchAll(/href="\/item\/([A-Za-z0-9]+)"/g)].map((m) => m[1]))] : [];
  const confidenceBadges = (plain(top).match(/(High|Medium|Low) confidence/g) ?? []).length;
  return { lines, dont, confidenceBadges };
}

async function why(id) {
  const res = await get(`/item/${id}`);
  assert(res.status === 200, `/item/${id} answered ${res.status}`);
  const t = plain(res.text);
  const n = (re, what) => { const m = t.match(re); assert(m, `${id}: cannot read ${what}`); return m; };
  const head = n(/lead time (\d+) day\(s\) · order cover (\d+) day/, "lead time and cover");
  const st = n(/(Reorder today|Don't reorder|OK)\s+(?:Order\s+(\d+)|No order needed|Do not reorder)/, "status");
  const conf = n(/(High|Medium|Low) confidence/, "confidence");
  const models = [...t.matchAll(/\bM([1-5]) [^|]*?\) (-?\d+\.\d{2}) (\d+\.\d{2}) (\d+\.\d)%/g)].map((m) => ({ m: "M" + m[1], f: +m[2], miss: +m[3], w: +m[4] }));
  const blended = +n(/Blended forecast (\d+\.\d{2})/, "blended forecast")[1];
  const spread = +n(/Spread between models = (\d+\.\d) units\/day/, "spread")[1];
  const ss = n(/Safety stock = larger of (\d+(?:\.\d+)?) and (\d+\.\d) × (\d+) = (\d+\.\d)/, "safety stock");
  const rp = n(/Reorder point = (\d+\.\d{2}) × (\d+) \+ (\d+\.\d) = (\d+\.\d)/, "reorder point");
  const sk = n(/Stock (\d+)(?: \+ (\d+) on order)? · (\d+\.\d|–) days of cover/, "stock line");
  const ord = t.match(/Order = (\d+\.\d{2}) × \((\d+) \+ (\d+)\) \+ (\d+\.\d) − (\d+) → (\d+)/);
  return {
    id, text: t, lead: +head[1], cover: +head[2], status: st[1], orderQty: st[2] ? +st[2] : 0, confidence: conf[1], models, blended, spread,
    minSafety: +ss[1], safety: +ss[4], reorderPoint: +rp[4], forecast: +rp[1], stock: +sk[1], onOrder: sk[2] ? +sk[2] : 0, coverDays: sk[3] === "–" ? Infinity : +sk[3],
    order: ord ? { f: +ord[1], l: +ord[2], c: +ord[3], s: +ord[4], pos: +ord[5], q: +ord[6] } : null,
    notes: { newItem: /New item: under 14 days/.test(t), slow: /Slow seller: under 1 sale a day/.test(t), festival: /ahead: look-alike model/.test(t), capped: /capped, please check/.test(t) },
    reason: (t.match(/(No sale in the last 14 days|More than 30 days of stock in hand|Stock at or below reorder point|Enough stock)/) ?? [])[1] ?? "",
  };
}

// Independent weights: 1 / miss, kept between 5% and 60% (BR5), written without the app's code.
function expectedWeights(miss) {
  const raw0 = miss.map((m) => 1 / Math.max(m, 0.05));
  const fixed = new Map();
  for (let k = 0; k < 10; k++) {
    const left = 1 - [...fixed.values()].reduce((a, b) => a + b, 0);
    const free = raw0.map((x, i) => [x, i]).filter(([, i]) => !fixed.has(i));
    const sum = free.reduce((a, [x]) => a + x, 0);
    const w = raw0.map((x, i) => (fixed.has(i) ? fixed.get(i) : (x / sum) * left));
    const hi = w.findIndex((x, i) => !fixed.has(i) && x > 0.6 + 1e-12);
    if (hi >= 0) { w.forEach((x, i) => { if (!fixed.has(i) && x > 0.6 + 1e-12) fixed.set(i, 0.6); }); continue; }
    const lo = w.some((x, i) => !fixed.has(i) && x < 0.05 - 1e-12);
    if (lo) { w.forEach((x, i) => { if (!fixed.has(i) && x < 0.05 - 1e-12) fixed.set(i, 0.05); }); continue; }
    return w;
  }
  return raw0.map(() => 0.2);
}

// ---------- CSV helpers ----------
function salesCsv(name, fromDay, toDay, qtyFor) {
  const rows = ["date,item_name,quantity"];
  for (let d = fromDay; d <= toDay; d = addDays(d, 1)) rows.push(`${d},${name},${qtyFor(d)}`);
  return rows.join("\n");
}
const upload = (csv) => post("/api/upload", csv, { json: false });
async function newItem(name, over = {}) {
  const r = await post("/api/items", { name, category: "Acceptance", pack: "1", price: "10", distributorId: "D01", leadTimeDays: "2", minSafetyStock: "2", orderCoverDays: "7", openingStock: "0", ...over });
  assert(r.status === 200, `could not add "${name}": ${r.text}`);
  return JSON.parse(r.text).id;
}

// ---------- the independent FR10 calculator ----------
function independentStockouts(stocks, extraSales = []) {
  const sales = [...rawSales, ...extraSales];
  const sold28 = {};
  for (const s of sales) if (s.date >= addDays(ASOF, -27) && s.date <= ASOF) sold28[s.id] = (sold28[s.id] ?? 0) + s.qty;
  const top = Object.keys(stocks).filter((id) => (sold28[id] ?? 0) > 0).sort((a, b) => sold28[b] - sold28[a] || a.localeCompare(b)).slice(0, 20);
  let days = 0;
  for (const id of top) for (let k = 0; k < 7; k++) {
    const day = addDays(ASOF, -k);
    const closing = stocks[id] + sales.filter((s) => s.id === id && s.date > day).reduce((a, s) => a + s.qty, 0);
    if (closing <= 0) days++;
  }
  return { itemDays: days, possible: top.length * 7 };
}
async function scorecard() {
  const t = plain((await get("/scorecard")).text);
  const oos = t.match(/Out of stock\s+(\d+)\s*item-days\s+(\d+) of (\d+) \(([\d.]+)%\)/);
  const slow = t.match(/Cash in slow stock\s*₹\s*([\d,]+)\s+(\d+) item\(s\)/);
  assert(oos && slow, "cannot read the scorecard numbers");
  return { itemDays: +oos[2], possible: +oos[3], slowValue: +slow[1].replace(/,/g, ""), slowItems: +slow[2], text: t };
}

// =====================================================================================================
async function main() {
  console.log(`Acceptance tests against ${BASE}  (as-of day ${ASOF})\n`);
  const home = await get("/").catch((e) => { throw new Error(`Cannot reach ${BASE}: ${e.message}`); });
  assert(home.status === 200, `Home answered ${home.status}`);
  const shop = plain(home.text).match(/Sri Balaji Stores/);
  if (!shop && !process.argv.includes("--force")) throw new Error("This is not the demo shop (Sri Balaji Stores). Refusing to add test data. Use --force only on a throw-away copy.");
  const ids0 = await itemIds();
  const fresh = ids0.length === 30 && (await soldToday()) === 0;
  if (!fresh) console.log("note: the server does not look freshly started (not 30 items / sales today). Restart it for clean numbers.\n");

  // ---- read-only scans first, on the untouched demo data ----
  const stocks0 = {};
  for (const id of ids0) stocks0[id] = await stockOf(id);
  const prices0 = await priceMap();
  const list0 = await reorderPage();
  const W = {};
  for (const id of ids0) W[id] = await why(id);

  await test("FR4", "Forecast Desk: five models, checked, blended; weights and blend match a hand calculation", "Script (+ unit test of BRD Appendix A4)", async () => {
    let checked = 0, skipped = 0;
    for (const id of ids0) {
      const w = W[id];
      if (w.models.length === 1) { assert(w.models[0].m === "M2" && near(w.blended, w.models[0].f, 0.011), `${id}: single-model blend must equal M2`); continue; }
      assert(w.models.length === 5, `${id}: expected 5 models, saw ${w.models.length}`);
      const sumW = w.models.reduce((a, m) => a + m.w, 0);
      assert(near(sumW, 100, 0.3), `${id}: weights add up to ${sumW.toFixed(1)}%`);
      if (w.notes.festival || w.notes.capped) { skipped++; continue; }
      // The screen rounds each weight to 0.1% (so the shown weights can add up to 99.9%) and each forecast to 0.01.
      // Scale the shown weights back to 100%, then allow for exactly that much rounding.
      const sumShown = w.models.reduce((a, m) => a + m.w, 0);
      const blend = w.models.reduce((a, m) => a + (m.w / sumShown) * m.f, 0);
      const slack = 0.001 * w.models.reduce((a, m) => a + Math.abs(m.f - w.blended), 0) + 0.012;
      assert(near(blend, w.blended, slack), `${id}: blend ${w.blended} is not the weighted average ${blend.toFixed(3)} (allowed rounding ${slack.toFixed(3)})`);
      const exp = expectedWeights(w.models.map((m) => m.miss));
      w.models.forEach((m, i) => assert(near(m.w, exp[i] * 100, 1.0), `${id} ${m.m}: weight ${m.w}% but 1/miss gives ${(exp[i] * 100).toFixed(1)}%`));
      checked++;
    }
    return `${checked} items re-weighted independently from their displayed misses (1/miss, 5% to 60%) and re-blended: all match (${skipped} festival/capped items skipped). BRD Appendix A4 sugar example (78 units): see "npm test".`;
  });

  await test("FR5", "Reorder list: every item at or below its reorder point is listed; quantities match BR1 and BR2; confidence shown", "Script", async () => {
    let listed = 0;
    for (const id of ids0) {
      const w = W[id];
      const pos = w.stock + w.onOrder;
      const onList = id in list0.lines;
      assert(onList === (w.status === "Reorder today"), `${id}: status "${w.status}" but ${onList ? "is" : "is not"} on the list`);
      if (w.status !== "Don't reorder" && !near(pos, w.reorderPoint, 0.1)) {
        assert((pos <= w.reorderPoint) === onList, `${id}: stock+ordered ${pos} vs reorder point ${w.reorderPoint} but ${onList ? "listed" : "not listed"}`);
      }
      if (onList) {
        listed++;
        assert(w.order, `${id}: no order working shown`);
        const rawQty = w.order.f * (w.order.l + w.order.c) + w.order.s - w.order.pos;
        assert(w.order.q >= rawQty - 0.1 && w.order.q <= rawQty + 1.1, `${id}: order ${w.order.q} is not ${rawQty.toFixed(2)} rounded up`);
        assert(list0.lines[id] === w.order.q, `${id}: list shows ${list0.lines[id]} but Why page says ${w.order.q}`);
      }
    }
    assert(list0.confidenceBadges >= listed, `only ${list0.confidenceBadges} confidence badges for ${listed} listed items`);
    return `${ids0.length} items checked one by one: ${listed} on the list, all others correctly off it; every quantity is forecast x (lead + cover) + safety - stock - ordered, rounded up, and equals the Why page; ${list0.confidenceBadges} confidence badges shown.`;
  });

  await test("FR6", "Don't reorder list: all 3 planted slow items flagged, none on the reorder list", "Script", async () => {
    const planted = ["I027", "I028", "I029"];
    assert(planted.every((id) => list0.dont.includes(id)), `Don't reorder shows ${list0.dont.join(", ")}; expected ${planted.join(", ")} ("${planted.map((i) => nameOf[i]).join('", "')}")`);
    assert(planted.every((id) => !(id in list0.lines)), "a planted slow item is on the reorder list");
    assert(list0.dont.length === 3, `Don't reorder has ${list0.dont.length} items, expected exactly 3 on the demo data`);
    return `Flagged: ${planted.map((i) => nameOf[i]).join(", ")}. None of them on the reorder list.`;
  });

  await test("FR9", "Why this number: each model's forecast, its weight and any condition", "Script (the 'owner explains it unaided' part is the user test)", async () => {
    for (const id of ids0) {
      const w = W[id];
      assert(w.models.length >= 1 && w.models.every((m) => m.f >= 0 && m.w > 0), `${id}: model table incomplete`);
      assert(/Miss = average units missed/.test(w.text), `${id}: no explanation of "miss"`);
    }
    const gated = ids0.filter((id) => W[id].notes.newItem || W[id].notes.slow);
    assert(gated.length >= 1, "no slow/new item showed its condition note");
    return partial(`All ${ids0.length} Why pages show each model's forecast, miss and weight; ${gated.length} items also show their condition note (slow/new). Still to do with real people: "an owner explains a reorder quantity without help" (see docs/user-test-script.md, task 4).`);
  });

  await test("BR1", "Reorder when stock + already ordered <= forecast x lead time + safety stock", "Script", async () => {
    let n = 0;
    for (const id of ids0) {
      const w = W[id];
      // forecast shows 2 decimals, safety stock and reorder point 1 decimal: allow that much rounding
      assert(near(w.reorderPoint, w.forecast * w.lead + w.safety, 0.005 * w.lead + 0.1), `${id}: reorder point ${w.reorderPoint} is not ${w.forecast} x ${w.lead} + ${w.safety}`);
      n++;
    }
    // "already ordered" counts: order the first listed item in full and it must leave the list
    const first = Object.keys(list0.lines)[0];
    assert(first, "nothing on the reorder list to test with");
    const q = list0.lines[first];
    const o = await post("/api/orders", { distributorId: "D01", lines: [{ itemId: first, qty: q }], prepSeconds: 60 });
    assert(o.status === 200, `could not send an order: ${o.text}`);
    const after = await reorderPage();
    const w2 = await why(first);
    assert(!(first in after.lines), `${first} is still listed after its full quantity was ordered`);
    assert(w2.onOrder === q && w2.status === "OK", `${first}: expected ${q} on order and status OK, saw ${w2.onOrder} / ${w2.status}`);
    return `Reorder point = forecast x lead + safety on all ${n} items. Ordering the full ${q} of ${nameOf[first] ?? first} took it off the list (stock + ${q} on order is above its reorder point).`;
  });

  await test("BR2", "Quantity = forecast x (lead + cover) + safety - stock - ordered, rounded up; cover 7 days, 1 for daily items", "Script", async () => {
    const daily = raw.items.filter((i) => i.orderCoverDays === 1).map((i) => i.id);
    assert(daily.length >= 5, "demo data has no daily-delivered items");
    for (const i of raw.items) assert(W[i.id].cover === i.orderCoverDays, `${i.id}: cover ${W[i.id].cover}, expected ${i.orderCoverDays}`);
    const milk = W["I008"];
    assert(milk.cover === 1, "milk order cover is not 1 day");
    return `Quantity formula checked on every listed item (see FR5). Order cover is 7 days by default and 1 day for the ${daily.length} daily items (${daily.map((i) => nameOf[i]).join(", ")}).`;
  });

  await test("BR3", "Safety stock = larger of the owner's minimum and (highest - lowest model) x lead time, capped at 7 days of demand", "Script", async () => {
    for (const id of ids0) {
      const w = W[id];
      const expected = Math.max(w.minSafety, Math.min(w.spread * w.lead, 7 * w.forecast));
      assert(near(w.safety, expected, 0.2), `${id}: safety stock ${w.safety}, expected about ${expected.toFixed(2)} (min ${w.minSafety}, spread ${w.spread}, lead ${w.lead})`);
      assert(w.safety >= w.minSafety - 0.05, `${id}: safety stock below the owner's minimum`);
    }
    return `All ${ids0.length} items: safety stock = max(minimum, spread x lead time) with the 7-day cap.`;
  });

  await test("BR5a", "Model weights between 5% and 60%; smaller miss = bigger weight", "Script", async () => {
    let n = 0;
    for (const id of ids0) {
      const ms = W[id].models;
      if (ms.length < 2) continue;
      for (const m of ms) assert(m.w >= 4.9 && m.w <= 60.1, `${id} ${m.m}: weight ${m.w}% is outside 5% to 60%`);
      if (W[id].notes.festival) continue; // a festival ahead lifts the look-alike model on purpose
      for (const a of ms) for (const b of ms) if (a.miss < b.miss - 0.02 && a.miss >= 0.05) assert(a.w >= b.w - 0.3, `${id}: ${a.m} (miss ${a.miss}) has a smaller weight than ${b.m} (miss ${b.miss})`);
      n++;
    }
    return `${n} items: every weight inside 5% to 60% and ordered by accuracy.`;
  });

  await test("BR5b", "Confidence: High within 20% of the forecast, Medium within 50%, Low above", "Script", async () => {
    let n = 0;
    for (const id of ids0) {
      const w = W[id];
      if (w.models.length < 2 || w.notes.capped) continue;
      const r = w.spread / w.blended;
      if ([0.2, 0.5].some((b) => near(r, b, 0.03))) continue; // too close to a limit for the rounded numbers on screen
      const expected = r <= 0.2 ? "High" : r <= 0.5 ? "Medium" : "Low";
      assert(w.confidence === expected, `${id}: spread/forecast = ${(r * 100).toFixed(0)}% so ${expected}, but the screen says ${w.confidence}`);
      n++;
    }
    return `${n} items: confidence label matches the 20% / 50% limits.`;
  });

  // ---- FR10: scorecard baseline, then a controlled stock-out ----
  const sc0 = await scorecard();
  await test("FR10", "Weekly scorecard numbers match numbers worked out independently from the raw data", "Script (stock-outs and slow stock). Forecast error: unit tests", async () => {
    const exp0 = independentStockouts(stocks0);
    assert(sc0.itemDays === exp0.itemDays && sc0.possible === exp0.possible, `Out of stock: app ${sc0.itemDays} of ${sc0.possible}, independent ${exp0.itemDays} of ${exp0.possible}`);
    const expSlow = list0.dont.reduce((a, id) => a + stocks0[id] * prices0[id], 0);
    assert(sc0.slowValue === Math.round(expSlow), `Slow stock: app Rs ${sc0.slowValue}, independent Rs ${Math.round(expSlow)}`);
    // controlled stock-out: a top seller with 0 stock on every day of the week
    const nm = "Acceptance Stockout Item";
    const sid = await newItem(nm, { openingStock: "0" });
    const up = await upload(salesCsv(nm, addDays(ASOF, -27), ASOF, () => 100));
    assert(up.status === 200 && JSON.parse(up.text).saved === 28, `could not load the stock-out sales: ${up.text}`);
    const stocks1 = { ...stocks0, [sid]: 0 };
    const extra = Array.from({ length: 28 }, (_, k) => ({ date: addDays(ASOF, -k), id: sid, qty: 100 }));
    const exp1 = independentStockouts(stocks1, extra);
    const sc1 = await scorecard();
    assert(sc1.itemDays === exp1.itemDays, `Out of stock after adding a sold-out top seller: app ${sc1.itemDays}, independent ${exp1.itemDays}`);
    assert(sc1.itemDays > sc0.itemDays, "a sold-out top seller did not raise the out-of-stock count");
    return partial(`Out-of-stock item-days ${sc0.itemDays} -> ${sc1.itemDays} after adding a top seller with 0 stock on all 7 days (equals the independent calculation). Slow stock Rs ${sc0.slowValue.toLocaleString("en-IN")} equals sum of stock x price of the ${list0.dont.length} Don't reorder items. Forecast error (blend vs plain 28-day average) is checked only by hand-computed unit tests, not re-computed independently here.`);
  });

  // ---- BR4: override ----
  await test("BR4", "Don't reorder overrides BR1: no sale in 14 days, or more than 30 days of stock", "Script (+ unit tests for the 30-day rule)", async () => {
    const nm = "Acceptance Idle Item";
    const id = await newItem(nm, { openingStock: "5", minSafetyStock: "10" });
    const w = await why(id);
    assert(w.stock + w.onOrder <= w.reorderPoint, `test set-up: stock ${w.stock} should be at or below the reorder point ${w.reorderPoint}`);
    assert(w.status === "Don't reorder" && /No sale in the last 14 days/.test(w.reason), `expected Don't reorder / no sale, saw ${w.status} / ${w.reason}`);
    const r = await reorderPage();
    assert(!(id in r.lines), "an item with no sale in 14 days is on the reorder list");
    assert(r.dont.includes(id), "the idle item is missing from the Don't reorder list");
    const over = raw.items.map((i) => W[i.id]).filter((w2) => w2.reason.startsWith("More than 30 days"));
    return `A new item with 5 in stock (below its reorder point ${w.reorderPoint.toFixed(1)}) and no sales is "Don't reorder: ${w.reason}" and is not on the reorder list. ${over.length ? `Demo items with more than 30 days of stock are also held back (${over.length}).` : "The more-than-30-days rule is covered by unit tests."}`;
  });

  // ---- BR5c / BR6: new item, spike ----
  await test("BR5c", "New items (under 14 days) use only the 28-day average and show Low confidence; weights are recalculated when sales change", "Script", async () => {
    const nm = "Acceptance New Item";
    const id = await newItem(nm, { openingStock: "50" });
    await upload(salesCsv(nm, addDays(ASOF, -4), ASOF, () => 5));
    const a = await why(id);
    assert(a.models.length === 1 && a.models[0].m === "M2" && a.confidence === "Low" && a.notes.newItem, `new item: ${a.models.length} models, ${a.confidence}, note=${a.notes.newItem}`);
    await upload(salesCsv(nm, addDays(ASOF, -34), addDays(ASOF, -5), (d) => 4 + (daysBetween("2026-01-01", d) % 4)));
    const b = await why(id);
    assert(b.models.length === 5 && !b.notes.newItem, `after 35 days of sales expected 5 models, saw ${b.models.length}`);
    return `After 5 days of sales: only M2, Low confidence, "New item" note. After 35 days: ${b.models.length} models with weights ${b.models.map((m) => m.w + "%").join(", ")}, confidence ${b.confidence}. The weights are worked out fresh on every page open.`;
  });

  let spikeId;
  await test("BR6", "Guard rail: forecast above double the 28-day average with no event is capped at double and flagged", "Script", async () => {
    const nm = "Acceptance Spike Item";
    spikeId = await newItem(nm, { openingStock: "1000" });
    await upload(salesCsv(nm, addDays(ASOF, -46), addDays(ASOF, -7), () => 5));
    await upload(salesCsv(nm, addDays(ASOF, -6), ASOF, () => 60));
    const w = await why(spikeId);
    const avg28 = (21 * 5 + 7 * 60) / 28; // from the file we just loaded
    assert(w.notes.capped, "no 'capped, please check' flag on a sudden spike");
    assert(near(w.blended, 2 * avg28, 0.011), `capped forecast ${w.blended} should be 2 x ${avg28} = ${2 * avg28}`);
    return `A spike (5 a day, then 60 a day for 7 days; 28-day average ${avg28}) gives forecast ${w.blended} = 2 x ${avg28}, flagged "capped, please check".`;
  });

  await test("FR8", "A date marked as a festival changes that week's look-alike forecast (and lifts the BR6 cap)", "Script", async () => {
    const before = await why("I004");
    const spikeBefore = await why(spikeId);
    const day = addDays(ASOF, 3);
    const add = await post("/api/calendar", { date: day, name: "Acceptance Festival", upliftPct: "100" });
    assert(add.status === 200, `team could not add a festival: ${add.text}`);
    const after = await why("I004");
    const m5b = before.models.find((m) => m.m === "M5"), m5a = after.models.find((m) => m.m === "M5");
    assert(m5b && m5a && m5a.f > m5b.f + 0.05, `look-alike forecast did not rise: ${m5b?.f} -> ${m5a?.f}`);
    assert(after.notes.festival, "no 'festival ahead' note after marking a date");
    assert(after.models.find((m) => m.m === "M5").w >= 29.9, `look-alike weight ${after.models.find((m) => m.m === "M5").w}% is under 30% with a festival ahead`);
    const spikeAfter = await why(spikeId);
    assert(spikeBefore.notes.capped && !spikeAfter.notes.capped, "the BR6 cap should not apply when a festival is marked");
    const del = await http("DELETE", `/api/calendar?date=${day}`);
    assert(del.status === 200, "could not remove the festival again");
    const back = await why("I004");
    assert(near(back.models.find((m) => m.m === "M5").f, m5b.f, 0.011), "forecast did not return to normal after the festival was removed");
    return `Sugar look-alike forecast ${m5b.f} -> ${m5a.f} a day with a +100% festival 3 days ahead (look-alike weight ${m5a.w}%, at least 30%); the spike item's cap was lifted; removing the date restores ${m5b.f}.`;
  });

  // ---- FR1, FR3: sales, items, deliveries ----
  await test("FR1", "One-tap sale saved in under 10 seconds and shown in today's sales", "Script (offline queue: browser test)", async () => {
    const id = "I008";
    const sold0 = await soldToday(), stock0 = await stockOf(id);
    const t0 = performance.now();
    const r = await post("/api/sales", { itemId: id, qty: 2 });
    const secs = (performance.now() - t0) / 1000;
    assert(r.status === 200, `sale answered ${r.status}: ${r.text}`);
    assert(secs < 10, `sale took ${secs.toFixed(1)} s`);
    const sold1 = await soldToday(), stock1 = await stockOf(id);
    assert(sold1 === sold0 + 2, `Sold today went ${sold0} -> ${sold1}, expected +2`);
    assert(stock1 === stock0 - 2, `Stock went ${stock0} -> ${stock1}, expected -2`);
    return partial(`Sale saved in ${(secs * 1000).toFixed(0)} ms. Sold today ${sold0} -> ${sold1}; stock ${stock0} -> ${stock1}. "With no network it is saved on the phone and sent later" needs a browser: see the browser test below.`);
  });

  await test("FR3", "Set up items and distributors; record deliveries; stock = old stock + delivered - sold", "Script (the 'matches a hand count' part is a shop check)", async () => {
    const dist = await post("/api/distributors", { name: "Acceptance Wholesale", supplies: "Snacks", salesman: "Anil", whatsapp: "+91 98765 43210", visitDay: "Friday" });
    assert(dist.status === 200, `could not add a distributor: ${dist.text}`);
    const did = JSON.parse(dist.text).id;
    const nm = "Acceptance Namkeen";
    const id = await newItem(nm, { price: "35", distributorId: did, leadTimeDays: "2", minSafetyStock: "3", orderCoverDays: "7", openingStock: "20" });
    assert((await stockOf(id)) === 20, "opening stock is not 20");
    assert((await post("/api/sales", { itemId: id, qty: 3 })).status === 200, "sale failed");
    assert((await post("/api/deliveries", { itemId: id, qty: 10 })).status === 200, "delivery failed");
    const stock = await stockOf(id);
    assert(stock === 27, `stock is ${stock}, expected 20 - 3 + 10 = 27`);
    const edit = await http("PUT", "/api/items", { body: { id, name: nm, category: "Acceptance", pack: "200 g", price: "40", distributorId: did, leadTimeDays: "3", minSafetyStock: "4", orderCoverDays: "5" } });
    assert(edit.status === 200, `could not edit the item: ${edit.text}`);
    const list = plain((await get("/setup/items")).text);
    assert(new RegExp(`${nm} 200 g ₹40 · Acceptance Wholesale · arrives in 3 d`).test(list), "edited price, distributor and lead time are not on the item list");
    const w = await why(id);
    assert(w.lead === 3 && w.cover === 5, `lead/cover not saved: ${w.lead}/${w.cover}`);
    const ed = await http("PUT", "/api/distributors", { body: { id: did, name: "Acceptance Wholesale", supplies: "Snacks", salesman: "Bharat", whatsapp: "+91 98765 43210", visitDay: "Monday" } });
    assert(ed.status === 200 && plain((await get("/setup/distributors")).text).includes("Bharat"), "distributor edit not saved");
    // deliveries screen: items with open orders, quantity filled in
    const q = 12;
    const ord = await post("/api/orders", { distributorId: did, lines: [{ itemId: id, qty: q }], prepSeconds: 80 });
    assert(ord.status === 200, "could not send an order");
    const html = (await get("/deliveries")).text;
    assert(new RegExp(`id="d-[^"]*${id}"[^>]*value="${q}"`).test(html), `the deliveries screen does not show ${q} pre-filled for the open order`);
    const rec = await post("/api/deliveries", { lines: [{ itemId: id, qty: q }] });
    assert(rec.status === 200 && (await stockOf(id)) === 27 + q, "saving the delivery from the open order did not add to stock");
    assert(!new RegExp(`id="d-[^"]*${id}"`).test((await get("/deliveries")).text), "the order is still open after the delivery was saved");
    return partial(`Item added with 20 in stock; sold 3, delivered 10 -> ${stock} (20-3+10). Edited price, distributor, lead time, minimum stock and cover: saved. Distributor added and edited. A sent order shows on Deliveries with its quantity pre-filled; one Save adds it to stock and closes it. Matching a hand count in the shop is a manual check.`);
  });

  await test("FR7", "Edit quantities and share the order on WhatsApp; the order is saved as Sent", "Script (the order); browser test (the WhatsApp link)", async () => {
    const r = await reorderPage();
    const id = Object.keys(r.lines)[0];
    assert(id, "nothing on the reorder list");
    const ord = await post("/api/orders", { distributorId: "D02", lines: [{ itemId: id, qty: 7 }], prepSeconds: 45 });
    assert(ord.status === 200 && /"orderId":"PO-\d+"/.test(ord.text), `order not saved: ${ord.text}`);
    const t = plain((await get("/deliveries")).text);
    assert(t.includes("7 ordered"), "the saved (Sent) order with the edited quantity 7 is not on the Deliveries screen");
    return partial(`An order with an edited quantity (7) is saved with an order number and shows as open on Deliveries. The WhatsApp link (distributor's number and order text) is tested in the browser.`);
  });

  // ---- BR7 ----
  await test("BR7a", "Only the owner can send orders or change stock, prices and settings; helpers can only record sales", "Script", async () => {
    const blocked = [
      ["POST", "/api/orders", { distributorId: "D01", lines: [{ itemId: "I001", qty: 3 }] }],
      ["POST", "/api/deliveries", { itemId: "I001", qty: 3 }],
      ["POST", "/api/items", { name: "Sneaky", price: "1", distributorId: "D01", leadTimeDays: "1", minSafetyStock: "1", orderCoverDays: "1" }],
      ["PUT", "/api/items", { id: "I001", name: "Toor Dal", price: "1", distributorId: "D01", leadTimeDays: "1", minSafetyStock: "1", orderCoverDays: "1" }],
      ["POST", "/api/distributors", { name: "Sneaky Co" }],
      ["POST", "/api/helpers", { email: "x@y.co" }],
      ["POST", "/api/calendar", { date: "2026-12-01", name: "X", upliftPct: 10 }],
      ["POST", "/api/ai/run", {}],
    ];
    for (const [m, p, b] of blocked) {
      const r = await http(m, p, { body: b, cookie: HELPER.cookie });
      assert(r.status === 403, `helper ${m} ${p} answered ${r.status}, expected 403`);
    }
    assert((await http("POST", "/api/upload", { body: "x", json: false, cookie: HELPER.cookie })).status === 403, "helper could upload a CSV");
    const before = await stockOf("I001"), price = (await priceMap())["I001"];
    const sale = await http("POST", "/api/sales", { body: { itemId: "I001", qty: 1 }, cookie: HELPER.cookie });
    assert(sale.status === 200, `helper sale answered ${sale.status}`);
    assert((await stockOf("I001")) === before - 1, "the helper's sale did not reduce stock");
    assert((await priceMap())["I001"] === price, "a price changed");
    return `${blocked.length + 1} owner actions refused (403) for a helper; the helper's sale was accepted; prices unchanged.`;
  });

  await test("BR7b", "A helper sees only the Sell screen", "Script", async () => {
    for (const p of ["/", "/reorder", "/deliveries", "/more", "/stock", "/scorecard", "/setup/items", "/setup/helpers", "/setup/calendar", "/ai", "/item/I001"]) {
      const r = await get(p, HELPER);
      assert(r.status === 307 && r.location.endsWith("/sell"), `helper opening ${p}: ${r.status} ${r.location}`);
    }
    const sell = await get("/sell", HELPER);
    assert(sell.status === 200, "the Sell screen did not open for a helper");
    const t = plain(sell.text);
    assert(!/₹\s?\d/.test(t), "the helper's Sell screen shows prices (BRD section 7: helpers see item names only)");
    assert(!/aria-label="Main"/.test(sell.text), "a navigation bar is shown to the helper");
    return `11 owner screens send a helper to Sell; the Sell screen has no navigation bar and shows item names and pack sizes only (no prices).`;
  });

  await test("BR7c", "No shopper personal data is recorded", "Script (data model and screens)", async () => {
    const schema = fs.readFileSync(new URL("../supabase/migrations/0001_schema.sql", import.meta.url), "utf8");
    const bad = schema.match(/customer|shopper|phone_number|aadhaar|address/gi);
    assert(!bad, `the database has a column that looks like shopper data: ${bad}`);
    const r = await post("/api/sales", { itemId: "I001", qty: 1, customerName: "Asha", phone: "9999999999" });
    assert(r.status === 200, "sale with extra fields failed");
    const all = plain((await get("/")).text + (await get("/stock")).text);
    assert(!/Asha|9999999999/.test(all), "an extra customer field was stored and shown");
    return "The sales table holds only date, item, quantity, price, method and who logged it. Extra customer fields sent to the API are ignored and never shown.";
  });

  // ---- FR2 last: loading the whole demo history again doubles the sales ----
  await test("FR2", "Upload the 30-day demo file (1,633 rows) in under 1 minute; bad rows are listed, not lost", "Script", async () => {
    const lines = ["date,item_name,quantity", ...raw.sales.map(([d, id, q]) => `${d},${nameOf[id]},${q}`)];
    assert(lines.length - 1 === 1633, `demo file has ${lines.length - 1} rows, expected 1,633`);
    lines.push("not-a-date,Toor Dal,5", "2026-10-01,Unknown Biscuit,3", "2026-10-01,Toor Dal,x");
    const t0 = performance.now();
    const r = await post("/api/upload", lines.join("\n"), { json: false });
    const secs = (performance.now() - t0) / 1000;
    assert(r.status === 200, `upload answered ${r.status}: ${r.text}`);
    const j = JSON.parse(r.text);
    assert(j.saved === 1633, `saved ${j.saved}, expected 1,633`);
    assert(j.errors.length === 3, `${j.errors.length} bad rows listed, expected 3`);
    assert(secs < 60, `upload took ${secs.toFixed(1)} s`);
    const lineNos = j.errors.map((e) => e.line).sort((a, b) => a - b);
    assert(lineNos.join() === "1635,1636,1637", `bad rows reported on lines ${lineNos}, expected 1635, 1636, 1637`);
    return `1,633 rows saved in ${secs.toFixed(2)} s; the 3 bad rows (bad date, unknown item, bad quantity) are listed with their line numbers: ${j.errors.map((e) => `line ${e.line}: ${e.issue}`).join("; ")}.`;
  });

  report();
}

function report() {
  const icon = { PASS: "PASS", FAIL: "FAIL", PARTIAL: "PARTIAL", SKIP: "SKIP" };
  const order = (id) => (/^FR/.test(id) ? 0 : 1) * 1000 + parseInt(id.replace(/\D/g, ""), 10) * 10 + (id.match(/[a-z]$/)?.[0]?.charCodeAt(0) ?? 96) - 96;
  results.sort((a, b) => order(a.id) - order(b.id));
  const lines = ["| ID | Acceptance test (from the BRD) | Result | How tested | Evidence |", "|---|---|---|---|---|"];
  for (const r of results) lines.push(`| ${r.id} | ${r.title} | **${icon[r.status]}** | ${r.method} | ${String(r.evidence).replace(/\|/g, "/").replace(/\n/g, " ")} |`);
  const count = (s) => results.filter((r) => r.status === s).length;
  const summary = `${count("PASS")} passed, ${count("PARTIAL")} partly (the rest is a browser or people check), ${count("FAIL")} failed, ${count("SKIP")} skipped.`;
  console.log(lines.join("\n"));
  console.log(`\n${summary}`);
  if (OUT) fs.writeFileSync(OUT, `<!-- made by scripts/acceptance.mjs against ${BASE} on ${istToday()} -->\n\n${lines.join("\n")}\n\n${summary}\n`);
  process.exitCode = count("FAIL") ? 1 : 0;
}

main().catch((e) => { console.error(`\nStopped: ${e.message}`); process.exit(2); });
