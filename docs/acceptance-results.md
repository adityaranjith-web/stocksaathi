# Acceptance test results (BRD FR1-FR10, BR1-BR7)

Run on **12 Nov 2026** against the **production build** (`npm run build` then `npm start`) in **demo mode** with the 30-item, 1,633-sale sample data. Script: `scripts/acceptance.mjs` (run it with `npm run acceptance`). Raw script output: `docs/acceptance-results-script.md`.

**18 PASS, 3 PARTLY, 0 FAIL** out of 21 checks covering FR1-FR10 and BR1-BR7.

**What "PARTLY" means:** the part a computer can check passed; the rest needs people or a shop (a hand count, an owner explaining the screen) or is checked only by unit tests. Nothing marked PARTLY failed.

## Results

| ID | Acceptance test (from the BRD) | Result | How tested | Evidence |
|---|---|---|---|---|
| FR1 | One-tap sale saved in under 10 seconds and shown in today's sales | **PASS** | Script + browser | Sale saved in 5 ms. Sold today 0 -> 2; stock 38 -> 36. "With no network it is saved on the phone and sent later" needs a browser: see the browser test below. BROWSER: with the network cut (fetch made to fail) on the production build, 2 taps were saved on the phone ("No network. Saved on phone", banner "1 sale(s) waiting for network", queue = 2); when the network returned the queue went to 0 and the server's Sold today rose 7 -> 9. |
| FR2 | Upload the 30-day demo file (1,633 rows) in under 1 minute; bad rows are listed, not lost | **PASS** | Script | 1,633 rows saved in 0.01 s; the 3 bad rows (bad date, unknown item, bad quantity) are listed with their line numbers: line 1635: Date must be YYYY-MM-DD: "not-a-date"; line 1636: Item not found: "Unknown Biscuit"; line 1637: Quantity must be a whole number above 0: "x". |
| FR3 | Set up items and distributors; record deliveries; stock = old stock + delivered - sold | **PARTIAL** | Script (the 'matches a hand count' part is a shop check) | Item added with 20 in stock; sold 3, delivered 10 -> 27 (20-3+10). Edited price, distributor, lead time, minimum stock and cover: saved. Distributor added and edited. A sent order shows on Deliveries with its quantity pre-filled; one Save adds it to stock and closes it. Matching a hand count in the shop is a manual check. |
| FR4 | Forecast Desk: five models, checked, blended; weights and blend match a hand calculation | **PASS** | Script (+ unit test of BRD Appendix A4) | 27 items re-weighted independently from their displayed misses (1/miss, 5% to 60%) and re-blended: all match (0 festival/capped items skipped). BRD Appendix A4 sugar example (78 units): see "npm test". |
| FR5 | Reorder list: every item at or below its reorder point is listed; quantities match BR1 and BR2; confidence shown | **PASS** | Script | 30 items checked one by one: 6 on the list, all others correctly off it; every quantity is forecast x (lead + cover) + safety - stock - ordered, rounded up, and equals the Why page; 6 confidence badges shown. |
| FR6 | Don't reorder list: all 3 planted slow items flagged, none on the reorder list | **PASS** | Script | Flagged: Coconut Hair Oil, Premium Basmati Rice, Room Freshener Spray. None of them on the reorder list. |
| FR7 | Edit quantities and share the order on WhatsApp; the order is saved as Sent | **PASS** | Script + browser | An order with an edited quantity (7) is saved with an order number and shows as open on Deliveries. The WhatsApp link (distributor's number and order text) is tested in the browser. BROWSER: typed 25 into Instant Noodles, tapped Share: WhatsApp opened https://wa.me/919876543210 (the distributor's number) with the text "Order from Sri Balaji Stores (PO-0012) / 1. Instant Noodles 70 g x 25 / ..."; the button became "Sent as PO-0012"; the order shows as open on Deliveries with 25 ordered; the screen said "Order prepared in 13 s". (The demo's own numbers are masked placeholders like +91 94XXX XX201, so WhatsApp opens without a number until the owner saves real numbers on the Distributors screen.) |
| FR8 | A date marked as a festival changes that week's look-alike forecast (and lifts the BR6 cap) | **PASS** | Script | Sugar look-alike forecast 8.66 -> 9.43 a day with a +100% festival 3 days ahead (look-alike weight 30%, at least 30%); the spike item's cap was lifted; removing the date restores 8.66. |
| FR9 | Why this number: each model's forecast, its weight and any condition | **PARTIAL** | Script (the 'owner explains it unaided' part is the user test) | All 30 Why pages show each model's forecast, miss and weight; 3 items also show their condition note (slow/new). Still to do with real people: "an owner explains a reorder quantity without help" (see docs/user-test-script.md, task 4). |
| FR10 | Weekly scorecard numbers match numbers worked out independently from the raw data | **PARTIAL** | Script (stock-outs and slow stock). Forecast error: unit tests | Out-of-stock item-days 0 -> 1 after adding a top seller with 0 stock on all 7 days (equals the independent calculation). Slow stock Rs 17,230 equals sum of stock x price of the 3 Don't reorder items. Forecast error (blend vs plain 28-day average) is checked only by hand-computed unit tests, not re-computed independently here. |
| BR1 | Reorder when stock + already ordered <= forecast x lead time + safety stock | **PASS** | Script | Reorder point = forecast x lead + safety on all 30 items. Ordering the full 53 of Sunflower Oil (pouch) took it off the list (stock + 53 on order is above its reorder point). |
| BR2 | Quantity = forecast x (lead + cover) + safety - stock - ordered, rounded up; cover 7 days, 1 for daily items | **PASS** | Script | Quantity formula checked on every listed item (see FR5). Order cover is 7 days by default and 1 day for the 6 daily items (Toned Milk, Curd, Butter, Paneer, Bread, Eggs (pack of 6)). |
| BR3 | Safety stock = larger of the owner's minimum and (highest - lowest model) x lead time, capped at 7 days of demand | **PASS** | Script | All 30 items: safety stock = max(minimum, spread x lead time) with the 7-day cap. |
| BR4 | Don't reorder overrides BR1: no sale in 14 days, or more than 30 days of stock | **PASS** | Script (+ unit tests for the 30-day rule) | A new item with 5 in stock (below its reorder point 10.0) and no sales is "Don't reorder: No sale in the last 14 days" and is not on the reorder list. Demo items with more than 30 days of stock are also held back (1). |
| BR5a | Model weights between 5% and 60%; smaller miss = bigger weight | **PASS** | Script | 27 items: every weight inside 5% to 60% and ordered by accuracy. |
| BR5b | Confidence: High within 20% of the forecast, Medium within 50%, Low above | **PASS** | Script | 20 items: confidence label matches the 20% / 50% limits. |
| BR5c | New items (under 14 days) use only the 28-day average and show Low confidence; weights are recalculated when sales change | **PASS** | Script | After 5 days of sales: only M2, Low confidence, "New item" note. After 35 days: 5 models with weights 21.1%, 21.4%, 17.6%, 22.8%, 17.1%, confidence High. The weights are worked out fresh on every page open. |
| BR6 | Guard rail: forecast above double the 28-day average with no event is capped at double and flagged | **PASS** | Script | A spike (5 a day, then 60 a day for 7 days; 28-day average 18.75) gives forecast 37.5 = 2 x 18.75, flagged "capped, please check". |
| BR7a | Only the owner can send orders or change stock, prices and settings; helpers can only record sales | **PASS** | Script | 9 owner actions refused (403) for a helper; the helper's sale was accepted; prices unchanged. |
| BR7b | A helper sees only the Sell screen | **PASS** | Script | 11 owner screens send a helper to Sell; the Sell screen has no navigation bar and shows item names and pack sizes only (no prices). |
| BR7c | No shopper personal data is recorded | **PASS** | Script (data model and screens) | The sales table holds only date, item, quantity, price, method and who logged it. Extra customer fields sent to the API are ignored and never shown. |

## Failures found and fixed

| Found by | What was wrong | Fix |
|---|---|---|
| BR7b | The helper's Sell screen showed each item's price ("500 ml · ₹27"). BRD section 7 says helpers see item names only, and the Helpers screen tells owners helpers cannot see prices. | `app/sell/page.tsx`: the price is no longer sent to a helper at all (the owner still sees it). Re-run: BR7b passes. |
| FR4 and BR1 (first runs) | The test said a blend and a reorder point were off by 0.05 to 0.09. | Not an app fault: the screen rounds weights to 0.1% and numbers to 1 or 2 decimals, and the first test allowed too little rounding. The test now allows exactly that rounding. |

## Not covered by this run

| Item | Status | Why |
|---|---|---|
| Supabase (live) mode: sign-in, row-level security, "a second shop cannot see the first shop's data", helper by Google email | **Not tested** | No Supabase project here. Migrations 0003 and 0004 and the live code were never run. Migration 0001's security was tested earlier on PostgreSQL 16. |
| Nightly Vercel cron (FR4 "every night", BR5 "reset every night") | **Not tested** | Vercel runs crons only on Production, and it needs the Supabase keys. The route's secret check and job logic are unit-tested; weights are recalculated on every page open (checked in BR5c). |
| 5 real users finish the 3 tasks unaided; owner explains "why" (FR9); stock matches a hand count (FR3) | **To do with people** | Use `docs/user-test-script.md`. |
| Low-cost Android phone on a slow connection | **To do** | Needs a real phone. |
| FR10 forecast error recomputed independently ("in Excel") | **Partly** | Stock-outs and slow stock were recomputed independently; forecast error only by hand-computed unit tests. |

## Finding for the go-live decision (not an FR or BR)

BRD section 8 says the app is ready to go live when "the Forecast Desk is no worse than the simple average (if it is worse, the app uses the simple average)", and the KPI target is at least 10% lower error. On the demo data the scorecard's back-test (last 7 days, each day forecast from earlier days only, top 20 items) shows the blend missing **2.65** units per item per day against **2.59** for the plain 28-day average: about **3% worse**. The "use the simple average if worse" fallback is **not built**. The demo data is synthetic, so this may not hold for a real shop, but the team should decide before 27 November: build the fallback, tune the models, or explain the result in the presentation. Check the scorecard again once the nightly job has saved real forecasts.
