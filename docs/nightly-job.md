# The nightly job

Every night Vercel calls `GET /api/cron/nightly`. For **every shop** the route runs the Forecast Desk and saves the result, so the scorecard can check forecasts against what really sold (BRD FR4, FR10, KPI 3).

## What it saves

For each active item, with `run_date` = the last complete day (yesterday, India time):

| Table | One row per | Holds |
|---|---|---|
| `model_forecasts` | item, night, model (M1 to M5) | each model's forecast, units per day over the order horizon. New and slow items have only M2. |
| `model_scores` | item, night, model | the model's average miss over the last 14 days, and the weight it got |
| `final_forecasts` | item, night | the blended forecast the reorder list used, its spread, confidence, decision (Reorder today / Don't reorder / OK), order quantity, and `horizon_days` (lead time + order cover) |

Saving the same night twice replaces the rows. It never doubles them. One shop failing does not stop the others.

The job uses the same code as the screens (`runShopDesk` in `lib/desk-service.ts`), so a saved forecast equals what the reorder list showed that night. A test checks this.

**The shop's own date, and the demo shop (migration 0008):** each shop is forecast up to the day before **its own business date** (the real last complete day unless days were closed ahead, see `docs/live-setup.md`, section 10). For the demo shop only (`is_sample_shop`), the job first fills every thin day up to that date (fewer than 5 sales) with labelled sample sales (`sales.is_sample`), reloads the shop (stock went down with them) and then runs the Desk, so the demo shop never has a zero-sales gap. It stops filling after 27 Nov 2026. The job's answer shows `"sampleSales"`. No other shop is ever given sample sales. "Close the day" runs the same per-shop code (`runShopNightly`) straight away.

**AI second opinion (optional):** when `AI_MODE` is `shadow` or `blend` and an AI provider is set up (see `docs/ai-integration.md`), the job also asks the AI for each item **after** the rows above are saved, and saves the answers to `ai_forecasts` (one row per item, day and provider; saving twice replaces). It has its own 40-second limit inside the route's 60 seconds and stops asking when the free limit is reached. An AI problem never fails the job and never loses the Forecast Desk rows: it only shows in the job's answer as `"ai": { "provider", "saved", "failed", "stopped" }` (`stopped` is `limit`, `error`, `time` or `null`).

## How the scorecard uses it

The scorecard's "Forecast error" card compares, for each saved forecast, the blend and the plain 28-day average (M2) with what really sold over the days that forecast covered. It uses the top 20 items and the last 4 weeks of nights, and counts a forecast only after all its days have passed (up to 9 days for a normal item). Until there are at least **40 checked forecasts from 3 nights**, the card shows a back-test instead and says so on screen.

## Set-up: environment variables to add in Vercel

Vercel → your project → **Settings → Environment Variables**. Add these, then **redeploy**.

| Name | Value | Where to get it | Environments |
|---|---|---|---|
| `CRON_SECRET` | a long random text (at least 16 characters; 64 is good) | make one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Production (and Preview if you want to test there) |
| `SUPABASE_SERVICE_ROLE_KEY` | the service-role (secret) key | Supabase → Project Settings → API Keys → `service_role` (or "Secret key") | Production (and Preview if you want to test there) |
| `NEXT_PUBLIC_SUPABASE_URL` | your project URL | Supabase → Project Settings → API | already set for live mode |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the public anon key | Supabase → Project Settings → API | already set for live mode |

Rules for the two new ones:
- Tick **Sensitive** when Vercel offers it, so the value cannot be read back.
- `SUPABASE_SERVICE_ROLE_KEY` skips all row-level security. It can read and write every shop's data. Never put it in code, in a `NEXT_PUBLIC_` name, in chat or in GitHub.
- Vercel sends `CRON_SECRET` to the route by itself as `Authorization: Bearer <CRON_SECRET>`. You never type it into the app.

## Database

Run `supabase/migrations/0004_nightly_job.sql` in the Supabase SQL editor (after 0001 to 0003). It adds `final_forecasts.horizon_days`.

## Schedule

`vercel.json` runs the job once a day at `30 20 * * *`, which is 20:30 UTC, 02:00 India time. The free plan allows one run a day and may start it up to an hour late (so between 02:00 and 03:00 India time). That is still the same India day, which is what the job needs.

## Important: Vercel only runs crons on Production

Vercel does **not** run cron jobs on Preview deployments. The job starts only after this code is on your **production branch** (`main`). Until then, run it by hand:

```bash
curl.exe -i -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-SITE.vercel.app/api/cron/nightly
```

(On a Preview URL this needs the two variables set for Preview, and Deployment Protection must allow the request.) In Vercel → Settings → **Cron Jobs** there is also a **Run** button for the production job.

Answers: `200` with `{ "ok": true, "shops": …, "items": …, "rows": … }` on success. `401` wrong or missing secret. `503` `CRON_SECRET` or the Supabase settings are missing. `500` at least one shop failed (details in the Vercel logs; the other shops are saved).

## Safety

- The route stays shut (503) if `CRON_SECRET` is missing or shorter than 16 characters. It is never open by accident.
- The secret is compared with a constant-time check.
- `SUPABASE_SERVICE_ROLE_KEY` is read in one file, `lib/server/supabase-admin.ts`, which refuses to load in a browser. `lib/secrets.test.ts` fails if the key, `CRON_SECRET` or a `NEXT_PUBLIC_`-named secret shows up anywhere else, or if a browser file imports server-only code.
- Middleware lets `/api/cron/*` through without a Google sign-in (Vercel has none). The secret is the only protection, which is why the checks above exist.
- The three tables stay read-only for signed-in users. Only the service-role key can write to them.

## Files

| File | Job |
|---|---|
| `app/api/cron/nightly/route.ts` | the route Vercel calls |
| `lib/server/nightly-handler.ts` | checks the secret, runs the job, picks the answer code |
| `lib/nightly.ts` | the job itself and the row builder (no database inside; testable) |
| `lib/server/supabase-admin.ts` | the only place that reads the service-role key |
| `lib/server/nightly-supabase.ts` | loads each shop's data and saves the rows |
| `supabase/migrations/0004_nightly_job.sql` | adds `horizon_days` |
| `lib/scorecard.ts` (`evaluateSavedForecasts`), `lib/scorecard-service.ts` | the scorecard reads the saved rows |
