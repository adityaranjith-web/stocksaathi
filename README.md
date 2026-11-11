# StockSaathi

A phone app that gives a kirana owner a daily "Reorder today" list. IT for Managers capstone, PGDM 2026–28, Group 3 (ASML).

## What works now (Stage A + Forecast Desk core)

| BRD requirement | Status | Where |
|---|---|---|
| FR1 Record a sale in one tap (works offline) | Done | `/sell` |
| FR2 Upload past sales as CSV, bad rows listed | Done | `/stock` |
| FR3 Record a delivery; stock updates | Done (item editing screen still to do) | `/stock` |
| FR4 Forecast Desk: 5 models, checked, blended | Done (runs when a page opens) | `lib/forecast/desk.ts` |
| FR5 Reorder list with quantities and confidence | Done | `/reorder` |
| FR6 Don't reorder list | Done | `/reorder#dont` |
| FR7 Edit quantities, share order on WhatsApp | Done | `/reorder` |
| FR8 Festival calendar | Table and data done; team editing screen to do | `conditions_calendar` |
| FR9 "Why this number" | Done | `/item/[id]` |
| FR10 Weekly scorecard | To do (Stage B) | — |

Still to build: item set-up screen (add/edit items), adding helpers, the nightly job that stores each model's forecast (needed for KPI 3), the scorecard, and the festival editing screen.

## Run it on your laptop (demo mode, no accounts needed)

```bash
npm install
npm run dev        # open http://localhost:3000 on your phone-sized browser window
npm test           # 14 checks, including the BRD sugar example (78 units)
```

With no Supabase keys set, the app uses the Session 6 sample data (30 items, 1,633 sales). Dates shift so the last sample day is always yesterday. Changes stay in memory until the server restarts.

## Go live (Supabase + Vercel, free tiers)

1. Create a Supabase project. In the SQL editor, run `supabase/migrations/0001_schema.sql`, then `supabase/seed.sql`.
2. Supabase → Authentication → Providers → Google: turn it on and paste the Google OAuth client ID and secret (Google Cloud console → APIs & Services → Credentials). Add `https://<your-app>.vercel.app/auth/callback` as a redirect URL.
3. Copy `.env.example` to `.env.local` and fill in the two Supabase values. Add the same two values in Vercel → Project → Settings → Environment Variables.
4. Push to GitHub and import the repo in Vercel.
5. Sign in once with the owner's Google account, then run the `insert into users ...` line at the bottom of `seed.sql` with that email.

## How the Forecast Desk works

For each item, every time the reorder list opens:

1. **Collect**: daily sales for the last 56 days, current stock, open orders, festival calendar.
2. **Five models**: M1 last 7 days, M2 last 28 days, M3 same weekday over the last 4 weeks, M4 smoothing (recent days count more), M5 look-alike days (salary week, weekends, festivals with the team's uplift %).
3. **Check first**: each model forecasts each of the last 14 days using only data before that day. Its average miss is its score.
4. **Blend**: weight = 1 ÷ miss, kept between 5% and 60%. New items (under 14 days) and slow items (under 1 a day) use M2 only. A festival ahead gives M5 at least 30%. Spread between models sets the confidence.
5. **Decide**: BR1–BR6 in the BRD. Guard rail caps a forecast above 2× the 28-day average when no event is marked.

The festival uplift percentages in the calendar (Deepavali +40% and so on) are team estimates. Check them with the owner interview.

## Checks done so far

- `npm test`: 14 unit tests pass (BRD worked example, all business rules, 2,000 random weight sets, the 3 planted slow items).
- Phone-size browser test of every screen: sale, offline queue, reorder, WhatsApp share, delivery, CSV upload with 3 bad rows.
- Database tested on PostgreSQL 16: schema and seed load; a second shop cannot see or change the first shop's data; a helper can record sales but cannot change prices or send orders; stock moves correctly with sales and deliveries.
