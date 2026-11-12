# StockSaathi: rules for Claude

A phone app that gives a kirana owner a daily "Reorder today" list. Next.js 15, Supabase, Vercel. The requirements are in `docs/S1_G3_BRD.pdf` (FR1 to FR10, BR1 to BR7). The clickable prototype is `docs/prototype.html`.

## Rules (always follow)

1. **Never change `lib/forecast/desk.ts` without keeping all tests passing.** Run `npm test` before and after any change to it. If a test must change because the BRD changed, say so and ask first. The BRD sugar example (78 units) must always pass.
2. **Never put secret keys in client code.** Only the public Supabase URL and anon key may be used in the browser (`NEXT_PUBLIC_` values). Never put a Supabase service-role key, API secret or password in any file under `app/`, `components/` or `lib/` that reaches the browser, and never commit `.env.local`.
3. **Work on a git branch, not on main.** Create a branch such as `feature/weekly-scorecard` before editing. Never commit or push straight to `main`.
4. **Add an entry to `docs/prompt-history.md` after every session.** One new row: number, date, who, the prompt (short), what changed, and what the team checked or rejected.
5. **Use plain, simple English in all screen text.** Short words, short sentences, no jargon. Say "Reorder today", not "Replenishment recommendation". This covers buttons, messages, errors and empty states.

## Commands

```bash
npm install
npm run dev      # demo mode at http://localhost:3000 when no Supabase keys are set
npm test         # vitest (the 14 Forecast Desk tests plus tests for the scorecard, timer, set-up checks and AI plug-in)
npm run build    # next build, also checks types and lint
npm run perf     # page-speed table for live mode (see docs/performance.md; needs a test login)
npm run db:test  # migrations + row-level security on a throw-away PostgreSQL (needs TEST_DATABASE_URL; see scripts/db-test.mjs)
```

## Layout

- `lib/forecast/desk.ts`: the Forecast Desk (5 models, check, blend, BR1 to BR6). Pure code, no database. Tests in `lib/forecast/desk.test.ts`.
- `lib/desk-service.ts`: builds each item's sales series and runs the Desk for the shop.
- `lib/data/`: `Store` interface with two versions: `demo.ts` (in memory, sample data) and `supabase.ts` (live, row-level security per shop).
- `app/`: screens (`/sell`, `/reorder`, `/deliveries`, `/more`, `/stock`, `/scorecard`, `/item/[id]`, `/setup/*` for items, distributors, helpers and festival calendar, `/ai`, `/login`) and `app/api/*` routes.
- `lib/auth.ts`: who is signed in (`getAccess()` gives ok, signed-out, no-shop or error; a broken database is never treated as signed-out). `/onboarding` is "Create your shop", `/setup/account` is sign-out and delete-account, `/api/health` is the live set-up self-check.
- Speed (see `docs/performance.md`): in live mode a page costs ONE database call, `shop_snapshot()`; `lib/data/supabase.ts` shares one cached sign-in check and one snapshot per request. New reads should come from the snapshot or be asked for in the same `Promise.all`, never one after another. No `select("*")` (a test fails). A change to a policy must keep `(select my_shop())` wrapping and not overlap another policy for the same action (`npm run db:test`, D18). `lib/perf.ts` times every Supabase call when `PERF_LOG=1`.
- `lib/data/db-contract.json`: what the code expects from the Supabase database and which migration adds it. Update it when the code uses a new table, column or function; `lib/db-contract.test.ts` and `npm run db:test` check it. `docs/live-setup.md` has the live-mode steps and every environment variable.
- `lib/auth.ts` (continued): `requireOwner()` / `requireTeam()` for pages, `ownerOnly()` / `teamOnly()` for API routes. Every new owner-only page and route must use one.
- `lib/scorecard.ts`, `lib/prep-time.ts`, `lib/validate.ts`: pure maths and checks, with tests next to them.
- `lib/nightly.ts` and `lib/server/`: the nightly job (Vercel cron -> `/api/cron/nightly`). `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are read only on the server (`lib/server/supabase-admin.ts`, the cron route). `lib/secrets.test.ts` enforces this. See `docs/nightly-job.md`.
- `lib/forecast/ai/`: plug-in system for AI forecasts (off by default; providers `mock`, `http`, `gemini`). See `docs/ai-integration.md`. AI settings are server-only. `AI_FORECAST_KEY` is read only in `registry.ts`. An AI failure or a reached free limit must never show an error to the owner or stop the nightly job (`run.ts`). In shadow mode the AI never changes an order. Gemini is asked for 5 items per call with a pause between calls, and a call that failed in a way that may pass (503, dropped connection, garbled answer) is tried again after 2 s and 4 s; the job's answer (`ai.firstError`) names the reason, so the Vercel logs are not needed.
- `lib/demo-login.ts`, `app/api/demo-login/route.ts`, `components/DemoLoginForm.tsx`: the "Demo login" (email + password) for exactly two accounts named by `DEMO_OWNER_EMAIL` / `DEMO_HELPER_EMAIL`. Never put a password in code or settings; Supabase holds them (`docs/live-setup.md`, section 8). Migration 0007 keeps demo accounts from deleting the shop.
- `lib/business-day.ts`: the shop's business date (one per shop, in `shops.business_date`, never behind the real date; the Desk works up to the day before it) and the sample sales for the demo shop only (labelled `sales.is_sample`, learned from the shop's own history, filled by the nightly job until 27 Nov 2026). "Close the day" / "Back to real date" are for the owner on the product team (`teamOnly()`, `close_day()`, `reset_business_date()`, migration 0008). Never give sample sales to any other shop; a new read of "today" must use `store.getBusinessDay()`, not `todayIST()`. See `docs/live-setup.md`, section 10. Sample sales record `stock_taken`, so Back to real date gives back exactly what they took (migration 0009). The demo owner is on the product team (it can close the day) but can never delete the shop.
- `supabase/migrations/`, `supabase/seed.sql`: database schema and sample data.

## Business rules to respect

- Only the owner can send orders or change stock, prices and settings. Helpers can only record sales (BR7). The database already enforces this; keep the screens in line with it.
- Record no shopper personal data.
- Every migration must pass `npm run db:test` before it is applied to Supabase. A new table needs row-level security and a test that a second shop cannot read it.
- Demo mode (no Supabase keys) must keep working for every screen. Demo mode has an Owner / Helper switch at the top.
- A helper sees only the Sell screen. New screens and API routes are owner-only unless they are about recording a sale.
