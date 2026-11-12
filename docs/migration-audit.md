# Migration audit: what the code expects against what the migrations and your project have

Checked on 12 Nov 2026 three ways: (1) the code's needs are written down in `lib/data/db-contract.json` and a unit test checks that list against the migration files; (2) all five migrations plus the seed were applied to an empty **real PostgreSQL** and 17 checks run (`npm run db:test`); (3) your Supabase project `stocksaathi` was inspected read-only before anything was changed, and `/api/health` was run against it.

## What each migration adds

| File | Adds |
|---|---|
| `0001_schema.sql` | The 12 tables, row-level security, stock triggers, `my_shop()`, `i_am_owner()`, `my_item()`, the festival calendar rows |
| `0002_lock_down_helper_functions.sql` | Removes anonymous access to the helper and trigger functions |
| `0003_roles_setup_scorecard_ai.sql` | `users.email`, `users.is_team`; `orders.prep_seconds`; table `helper_invites`; `claim_invite()`; `i_am_team()`; helper-removal and calendar policies; table `ai_forecasts` |
| `0004_nightly_job.sql` | `final_forecasts.horizon_days` |
| `0005_onboarding_and_account_deletion.sql` | `users.consented_at`, `users.consent_version`; `create_shop()`; `delete_my_account()`; a foreign-key fix |

## What your project was missing

Your project had only `0001` and `0002`. Everything the app needs from `0003` to `0005` was missing (11 things, as `/api/health` reported):

- columns `users.email`, `users.is_team`, `users.consented_at`, `users.consent_version`, `orders.prep_seconds`, `final_forecasts.horizon_days`
- tables `helper_invites`, `ai_forecasts`
- functions `claim_invite()`, `create_shop()`, `delete_my_account()`

**Why live mode broke:** the app reads `users.is_team` on every request, which did not exist, so the database refused the question. The old code treated any such error as "not signed in" and kept sending people to the sign-in page even though they were signed in. That is fixed: a wrong database is now reported as a set-up problem (and `/api/health` names the migration), never confused with being signed out.

Also seen in the project: **no one has ever signed in** (`auth.users` is empty), so Google sign-in was never completed; the demo shop has id `79488d94-…` (not the id in `seed.sql`), 30 items and 822 sales (the seed file has 1,633), so the claim script finds the shop by name, not id.

## Problems found in the migrations and fixed (in `0005`)

| Problem | Found by | Fix |
|---|---|---|
| **The owner could not remove a helper who had recorded any sale.** `sales.logged_by` pointed at `users(id)` with no delete rule, so the delete failed. | Database test D12 on real PostgreSQL | `0005` changes it to `on delete set null`: the sales stay, only the link to the person is cleared |
| **Deleting a whole shop failed** with a foreign-key error (order lines point at items and are checked before the orders are removed). | Database tests D16 and D17 | `delete_my_account()` deletes from the inside out, one table at a time |
| Live sales were read 1,000 at a time **without an order**, so pages could repeat or skip rows once a shop had over 1,000 sales. | Code review while checking the store | `lib/data/supabase.ts` now orders by id (fixed in an earlier commit) |

## Things that are fine, and why

- Every `.from("table")` and `.rpc("function")` in the code is in the list, and every upsert (`onConflict`) names a primary key or unique index (D3, D4).
- Signed-out visitors can read nothing and run none of the account functions (D10; also checked on the real project).
- The advisor's "SECURITY DEFINER functions" warnings are intended (see `docs/live-setup.md`, section 7).
- Row-level security: a second account sees none of the first shop's rows in 10 tables and cannot write into it, rename it, move itself into it, or use its item ids (D9; repeated on the real project).

## Still not covered

- The app talking to Supabase **through its API with a real Google sign-in**: the database rules and the functions are tested on real PostgreSQL and on your real project, and the signed-out side of the live app is tested over HTTP, but nobody has yet signed in through the app. See `docs/acceptance-results.md`, "Live mode".
- Row-level security after future migrations: re-run `npm run db:test` when a migration changes.

## Keeping this true

`lib/data/db-contract.json` must be updated when the code starts using a new table, column or function (`lib/db-contract.test.ts` checks it against the migration files and `npm run db:test` against a real database). `/api/health` reads the same list, so it always names the right migration.
