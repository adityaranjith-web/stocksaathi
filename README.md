# StockSaathi

A phone app that gives a kirana owner a daily "Reorder today" list. IT for Managers capstone, PGDM 2026–28, Group 3 (ASML).

## What works now (Stage A + Forecast Desk core)

| BRD requirement | Status | Where |
|---|---|---|
| FR1 Record a sale in one tap (works offline) | Done | `/sell` |
| FR2 Upload past sales as CSV, bad rows listed | Done | `/stock` (More → Stock) |
| FR3 Set up items and distributors; record deliveries; stock updates | Done | `/setup/items`, `/setup/distributors`, `/deliveries` |
| FR4 Forecast Desk: 5 models, checked, blended | Done. Runs when a page opens, and every night for every shop (Vercel cron) | `lib/forecast/desk.ts`, `/api/cron/nightly` |
| FR5 Reorder list with quantities and confidence | Done | `/reorder` |
| FR6 Don't reorder list | Done | `/reorder#dont` |
| FR7 Edit quantities, share order on WhatsApp | Done | `/reorder` |
| FR8 Festival calendar (product team) | Done | `/setup/calendar` |
| FR9 "Why this number" | Done | `/item/[id]` |
| FR10 Weekly scorecard | Done | `/scorecard` |
| BR7 Owner and helper roles | Done (screens, API and database) | `lib/auth.ts`, `/setup/helpers` |
| KPI 2 Order preparation timer | Done | `/reorder`, shown on `/scorecard` |
| Future AI integration | Plug-in system built, off by default | `docs/ai-integration.md`, `/ai` |

Still to build: a cost price per item (slow stock is valued at selling price for now).

**Nightly job.** A Vercel cron calls `/api/cron/nightly` once a day. It runs the Forecast Desk for every shop and saves `model_forecasts`, `model_scores` and `final_forecasts`; the scorecard reads forecast accuracy from them. It needs two server-only variables, `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`, and only runs on the Production deployment. Full steps: `docs/nightly-job.md`.

**Roles.** The owner sees everything. A helper sees only the Sell screen. In demo mode use the Owner / Helper switch at the top. In live mode the owner adds a helper by Google email (More → Helpers). A member of the product team is an owner with `is_team = true` in the `users` table; only they see the festival calendar.

## Run it on your laptop (demo mode, no accounts needed)

```bash
npm install
npm run dev        # open http://localhost:3000 on your phone-sized browser window
npm test           # all checks, including the BRD sugar example (78 units)
```

With no Supabase keys set, the app uses the Session 6 sample data (30 items, 1,633 sales). Dates shift so the last sample day is always yesterday. Changes stay in memory until the server restarts.

## Go live (Supabase + Vercel, free tiers)

The full guide is **`docs/live-setup.md`**. In short:

1. **Database.** In the Supabase SQL editor run `supabase/migrations/0001` to `0005` in order (then `supabase/seed.sql` for the demo shop). Open `https://YOUR-SITE/api/health`: it names any migration that is missing.
2. **Google sign-in.** Google Cloud: an OAuth client whose redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback` (and your Google account listed as a test user). Supabase: switch the Google provider on, set the Site URL, and add `https://<your-app>.vercel.app/auth/callback` (and a pattern for preview builds) to the Redirect URLs.
3. **Vercel variables** (Settings → Environment Variables, Production and Preview, then redeploy): `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public); for the nightly job also `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` (secrets, tick Sensitive).
4. **First owner.** Sign in with Google once, then run `supabase/claim_demo_shop.sql` (with your email) in the SQL editor to become the owner of "Sri Balaji Stores". Anyone else who signs in without an invite sees **Create your shop** (with a short privacy notice) and gets their own empty shop. The owner can delete the account and all shop data at More → Your account.

## How the Forecast Desk works

For each item, every time the reorder list opens:

1. **Collect**: daily sales for the last 56 days, current stock, open orders, festival calendar.
2. **Five models**: M1 last 7 days, M2 last 28 days, M3 same weekday over the last 4 weeks, M4 smoothing (recent days count more), M5 look-alike days (salary week, weekends, festivals with the team's uplift %).
3. **Check first**: each model forecasts each of the last 14 days using only data before that day. Its average miss is its score.
4. **Blend**: weight = 1 ÷ miss, kept between 5% and 60%. New items (under 14 days) and slow items (under 1 a day) use M2 only. A festival ahead gives M5 at least 30%. Spread between models sets the confidence.
5. **Decide**: BR1–BR6 in the BRD. Guard rail caps a forecast above 2× the 28-day average when no event is marked.

The festival uplift percentages in the calendar (Deepavali +40% and so on) are team estimates. Check them with the owner interview.

## Checks done so far

- `npm test`: 93 unit tests pass. The first 14 (BRD worked example, all business rules, 2,000 random weight sets, the 3 planted slow items) are unchanged. New: scorecard maths, order timer, set-up checks, AI plug-in rules, the nightly job and its secret check, a scan that fails if a secret key shows up in browser code, the create-shop checks, and a check that the list of what the app expects from the database matches the migration files.
- Phone-size browser test of every screen: sale, offline queue, reorder, WhatsApp share, delivery, CSV upload with 3 bad rows.
- Database tested on PostgreSQL 16: schema and seed load; a second shop cannot see or change the first shop's data; a helper can record sales but cannot change prices or send orders; stock moves correctly with sales and deliveries.
- Demo mode, new features: every screen opens as owner; as helper every screen except Sell redirects to Sell and every owner API answers 403; items, distributors, helpers, festival days, deliveries and AI runs tested through the API; order timer tested in the browser.
- **Acceptance tests (BRD):** every FR and BR was run against the production build in demo mode: **18 pass, 3 partly, 0 fail** (the 3 "partly" need people or a shop: a hand count, an owner explaining the screen, and the forecast error re-computed by hand). Details, evidence and the failures found and fixed: `docs/acceptance-results.md`. Re-run any time: start the app (`npm run build && npm start`) and run `npm run acceptance` (it adds test data, so restart the server afterwards).
- **Live mode (database level):** `npm run db:test` applies migrations 0001 to 0005 to a real PostgreSQL and plays an owner, a second Google account, a helper and an anonymous visitor against the row-level security, "Create your shop", the claim script and "Delete my account": **17 of 17 pass** (`docs/live-db-results.md`). The same two-user test was run on the real Supabase project inside a transaction that always rolls back (nothing saved). It found and fixed two real bugs (removing a helper who had recorded sales; deleting a shop). `npm run acceptance:live` checks the signed-out side of the live app over HTTP (5 of 5 pass).
- **Not yet tested:** a real **Google sign-in through the app** (so the signed-in checks in `scripts/acceptance-live.mjs`, including "a second Google account cannot see the first shop's data" through the app, are written but not run), the Vercel cron, and a real Android phone. Results: `docs/acceptance-results.md`, part 2.
- **Open finding:** on the demo data the blended forecast is about 3% *worse* than the plain 28-day average (BRD wants at least 10% better, and says to fall back to the simple average if worse). The fallback is not built. See the last section of `docs/acceptance-results.md`.

## Testing with real users

`docs/user-test-script.md` is a one-page script for the 5 real users (log 10 sales, read the reorder list, share one order), with the pass marks from the BRD and a sheet to fill in.
