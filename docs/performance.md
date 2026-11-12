# Speed: what was slow, what changed, and the numbers

No screen, text or forecast changed. Every reorder quantity and every "Why this number" result is identical before and after (compared one by one, see "Same results" below).

## Page speed, live mode, measured against your real Supabase project

Measured with `scripts/perf.mjs` using a temporary test login (since deleted) that was the owner of Sri Balaji Stores: 30 items, 822 sales. The app ran as a production build (`npm run build`, `npm start`) on this computer in India and talked to Supabase in Seoul, so every round trip cost about 200 to 300 ms. **Counts are exact. Milliseconds are real but include that long distance and the internet's ups and downs**, so read them as before-against-after on the same line, not as the speed on Vercel (see the estimate below).

| Page | Server ms before | Server ms after | DB calls in the code, before → after | Round trips to Supabase, before → after |
|---|---|---|---|---|
| Home | 1105 | 431 | 20 → 1 | 8 → 1 |
| Sell | 1038 | 324 | 8 → 1 | 4 → 1 |
| Reorder | 947 | 338 | 20 → 1 | 8 → 1 |
| Stock | 796 | 333 | 17 → 1 | 7 → 1 |
| Why this number | 753 | 336 | 17 → 1 | 7 → 1 |
| Scorecard | 1252 | 957 | 27 → 5 | 11 → 5 |

Full tables: `docs/perf-before.md` (median of 5 runs) and `docs/perf-after.md` (median of 9 runs), with the time to load the page as seen by the client too (Home 1600 → 793 ms, Sell 1302 → 615, Reorder 1275 → 674, Stock 1054 → 650, Why 992 → 660, Scorecard 1499 → 1249).

- **DB calls in the code** is how many times the code asked Supabase for something. **Round trips** is how many really went over the network: Next.js answers a repeated identical GET from memory while one page renders, so the first column was already partly hidden. The second column is the one that costs time.
- After the change a page waits for **one** round trip (about 300 ms from here). The rest of the server time is the page being built (about 30 to 130 ms).
- **Scorecard** still asks for 5 things (shop snapshot, deliveries, orders, two saved-forecast tables), but now all at the same time. Its remaining time is mostly the back-test calculation (about 300 ms of computer work) until the nightly job has saved enough real forecasts, plus the network ups and downs of five calls.
- The middleware makes one more sign-in check with Supabase for each page. It is not in these counts (see "Not done").

### What it should be on Vercel (an estimate, not a measurement)

Vercel ran the app in Washington (`iad1`), about 200 to 230 ms from Seoul for every round trip, and a page waited for roughly three in a row (sign-in, user row, then the reads). `vercel.json` now pins the functions to Seoul (`icn1`), next to the Supabase project in `ap-northeast-2`, where a round trip is about 2 to 10 ms. Expect a page to go from about 700 ms to about 50 to 150 ms. **Check it:** set `PERF_LOG=1` in Vercel, open a page, and read the `[perf]` line in Vercel → Logs.

## What changed

1. **Region.** `vercel.json` has `"regions": ["icn1"]`. The functions now run in Seoul.
2. **Sign-in and user once per page.** `lib/data/supabase.ts` no longer asks Supabase who you are on every store call. One cached check per page request (React cache) is shared by everything. It reads the sign-in cookie instead of making another network call: the middleware has already checked that same cookie with Supabase's auth server on the same request, and every query is sent with the cookie's token, which the database verifies and limits with row-level security. A forged cookie gets no data. (The auth call also made the data calls wait for it, so the old two-step cost a page two round trips.)
3. **Daily totals, not raw sales.** `daily_sales(since)` (migration 0006) returns one total per item per day as a single JSON value, so the API's 1,000-row limit can never cut it short and a shop with years of sales sends the same 56 days. The Forecast Desk adds up sales per day anyway.
4. **One trip.** `shop_snapshot(since)` returns the person, the shop, items, distributors, daily sales, the festival calendar and what is on order in one call. `getMe`, `getShop`, `listItems`, `listDistributors`, `listSales`, `listCalendar`, `openOrderQty` and `openOrders` are all served from it. Writes (a sale, a delivery) stay light: they do not fetch the snapshot.
5. **Database.** Every policy now calls `my_shop()`, `i_am_owner()` and `i_am_team()` once per query (`(select ...)`), the "owner writes" policies are split into insert, update and delete so a read is checked by one policy only, and there are indexes on `shop_id` for sales, orders, deliveries, items, distributors and users (plus helper invites, order lines and the two forecast tables). Same rules, faster: on 200,000 rows the old policy called `my_shop()` 200,001 times and took about 1,450 ms; the new one calls it once and takes about 15 ms (`npm run db:test`, D21).
6. **Only the columns a screen uses.** No query uses `select("*")` any more, and a test fails if one comes back.
7. **Scorecard** asks for all its data at once instead of in three steps.

All database changes are in `supabase/migrations/0006_performance.sql` (applied to your project on 12 Nov 2026 with your permission, after passing every check on a real PostgreSQL).

## Same results (checked three ways)

- **On your real project, before and after:** every reorder quantity (6 items on the list) and all 30 "Why this number" results (forecast, weights, spread, safety stock, reorder point, status, order) were saved before the change and again after, and compared: **0 differences** (`node scripts/perf.mjs --compare=before.json,after.json`).
- **Unit test (`lib/data/supabase.perf.test.ts`):** the Forecast Desk is run on the raw sales rows and on the daily totals the snapshot returns, for all 30 items. Forecasts, weights, confidence, decisions and order quantities are exactly equal.
- **Database (`npm run db:test`, D19 and D20, real PostgreSQL):** `daily_sales` equals the raw sales to the unit, with more than 1,000 daily totals and no cut; `shop_snapshot` equals the old separate queries; and all 17 earlier isolation checks (second Google account, helper, anonymous, delete account) still pass with the new policies (D18 also proves no table has two policies for the same action).

## How to measure again

```bash
# start the app in live mode with the log on (PowerShell), then:
$env:PERF_LOG="1"; npm run build; npm start *> server.log
# a test login in the same Supabase project (email and password), owner of a shop:
node scripts/perf.mjs --base=http://localhost:3000 --runs=9 --snapshot=after.json
node scripts/perf.mjs --compare=before.json,after.json
```

`PERF_LOG=1` makes the server write one `[perf]` line per page (`lib/perf.ts`): time, calls in the code, round trips, and each call's time. It is off by default.

## Not done (and why)

- **Middleware sign-in check.** The middleware still asks Supabase's auth server who you are on every page (about one round trip at the edge). That is the check the rest of the app now relies on, so it stays. It could be made local with Supabase's new signing keys (`getClaims`); this project still uses the legacy key.
- **A sale tap makes 2 calls** (look up the shop and user, then insert). Giving `sales.shop_id` and `logged_by` database defaults would make it 1. Not asked for, so not changed.
- **The nightly job** still reads raw sales (once a day, per shop, with its own paging).
- **Supabase's advisor** now lists only INFO items: 7 foreign keys without an index (item/distributor links, not on any page's path) and the new indexes as "unused" (the tables are tiny, so Postgres reads them directly; the indexes matter as sales grow).
- **Demo mode** is unchanged (it is in memory and already fast).
