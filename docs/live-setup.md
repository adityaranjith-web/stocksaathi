# Live mode set-up (Supabase + Google sign-in + Vercel)

Live mode is on when the two `NEXT_PUBLIC_SUPABASE_*` settings exist. Without them the app runs in demo mode. This guide lists everything live mode needs, in the order to do it. **Never paste a secret value into chat, a file, or GitHub.**

After each step open **`https://YOUR-SITE/api/health`**. It says what is still missing, by name, and which migration to run. It never shows a key or any data.

## 1. Environment variables in Vercel

Vercel → your project → **Settings → Environment Variables → Add**. For each one, tick **Production** and **Preview** (your branch deployments are Previews). Then **redeploy**: the `NEXT_PUBLIC_` values are baked in when the site is built, so a change only shows after a new build.

| Name | Needed for | Value (where to get it) | Secret? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Live mode (required) | Supabase → Project Settings → API → Project URL. For this project: `https://ogdjamovhetexmvgthue.supabase.co` | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Live mode (required) | Supabase → Project Settings → API Keys → **Publishable key** (`sb_publishable_...`), or the legacy `anon` key. **Not** the service-role or secret key. | No. It is meant to be public. |
| `SUPABASE_SERVICE_ROLE_KEY` | Nightly job only | Supabase → Project Settings → API Keys → **Secret key** (or legacy `service_role`) | **Yes.** Tick **Sensitive**. It skips all row-level security. |
| `CRON_SECRET` | Nightly job only | Make one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (16 characters or more) | **Yes.** Tick **Sensitive**. |
| `DEMO_OWNER_EMAIL`, `DEMO_HELPER_EMAIL` | Optional "Demo login" form for reviewers (section 8) | The two email addresses of the demo owner and demo helper users you create in Supabase. **Not** passwords. | No (they are shown nowhere, but are not secret keys) |
| `AI_MODE` | Optional AI second opinion | `shadow` (see `docs/ai-integration.md`) | No |
| `AI_FORECASTER` | Optional AI second opinion | `gemini` (or `mock`, `http`) | No |
| `AI_FORECAST_KEY` | AI with Gemini (required) or an `http` service (optional) | Google AI Studio → Get API key | **Yes.** Tick **Sensitive**. |
| `AI_GEMINI_MODEL`, `AI_FORECAST_URL` | Optional | `docs/ai-integration.md` | No |

Rules: the two secrets must **not** start with `NEXT_PUBLIC_`; they are read only in server code (`lib/server/`, the cron route), and a test fails if they appear anywhere a browser could see them. Without `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` the app works; only the nightly job is off.

## 2. Sign-in: Google and Supabase (the usual reason sign-in never finishes)

Your project had **no sign-in records at all** (`auth.users` empty), so Google sign-in has never completed. Check all four:

1. **Google Cloud Console** → APIs & Services → Credentials → create an **OAuth client ID** (type: Web application). Under **Authorized redirect URIs** add exactly `https://ogdjamovhetexmvgthue.supabase.co/auth/v1/callback`. Copy the client ID and client secret.
2. Google Cloud → **OAuth consent screen**. While it says **Testing**, only the Google accounts you add under **Test users** can sign in (add yours and your second test account). Publish it later if you want anyone to sign in.
3. **Supabase** → Authentication → **Sign In / Providers → Google**: switch it on and paste the client ID and secret.
4. **Supabase** → Authentication → **URL Configuration**:
   - **Site URL**: your main address, for example `https://YOUR-APP.vercel.app`.
   - **Redirect URLs** (add each): `https://YOUR-APP.vercel.app/auth/callback`, `http://localhost:3000/auth/callback`, and for preview builds a pattern such as `https://*-YOUR-VERCEL-NAME.vercel.app/auth/callback`.
   - If the address the app uses is **not** on this list, Supabase sends people to the Site URL instead, and the sign-in looks like it did nothing. This is the most common fault.

If sign-in fails the app now says so: the sign-in page shows "Sign-in did not finish" (and the cause is in the Vercel log), or "Google sign-in could not start" if the provider is off.

### Check Google sign-in end to end (do this once, in this order)

1. Open `https://YOUR-SITE/api/health`. You want `"mode": "live"` and `"ok": true`. If it says `demo`, the two `NEXT_PUBLIC_SUPABASE_*` settings are missing on this deployment (section 1).
2. Open `https://YOUR-SITE/login` in a **private window**. You see **Sign in with Google**. Tap it.
3. Google asks you to choose an account. If it says "access blocked" or "this app is not verified": add your account under Google Cloud → OAuth consent screen → **Test users** (step 2 above).
4. Google sends you back to the app. You should land on **Create your shop** (a new person) or on **Home** (if you are already linked). If you land back on the sign-in page with "Sign-in did not finish", the redirect URL is not on Supabase's list (step 4 above).
5. Prove the sign-in really happened. In Supabase → SQL editor run `select email, created_at, last_sign_in_at from auth.users;` You should see your email. Nothing else is needed from the app.
6. Do **not** fill in Create your shop. Close the tab and do section 4 (become the owner of Sri Balaji Stores).

## 3. Database migrations

Run the files in `supabase/migrations/` **in order** in the Supabase SQL editor: `0001`, `0002`, `0003`, `0004`, `0005`, `0006`, `0007`, `0008`. `supabase/seed.sql` adds the demo shop and is optional. After the seed on a fresh project also run `update shops set is_sample_shop = true where name = 'Sri Balaji Stores';` (migration 0008 does this for an existing project).

**Status of your project `stocksaathi`:** `0001` and `0002` were applied earlier. `0003`, `0004`, `0005` and `0006` (the speed migration) were applied on 12 Nov 2026 (with your permission) and `/api/health` then reported nothing missing. `0007` (protects the demo accounts) was applied later the same day, also with your permission. `0008` (the shop's business date, "Close the day" and labelled sample sales) was applied on 13 Nov 2026, also with your permission. Your 30 items and 822 real sales were not changed by the migrations. What was missing before is in `docs/migration-audit.md`.

## 4. Become the owner of "Sri Balaji Stores"

Do this once, after your first Google sign-in (the sign-in is what creates your login record):

1. Open the app and sign in with Google. You will see **Create your shop**. Do **not** fill it in; close the tab.
2. Supabase → SQL editor → paste `supabase/claim_demo_shop.sql`, change the email on the line marked `CHANGE THIS` to your Google email, and run it.
3. Reload the app. You are the owner of Sri Balaji Stores. (Optional, to edit the festival calendar: `update users set is_team = true where lower(email) = lower('YOUR_GOOGLE_EMAIL@gmail.com');`)

It is safe to run twice, only the SQL editor can run it (so nobody else can take over the shop), and it removes a shop you made by mistake only if that shop is still empty. If you already made a shop with items or sales it refuses and tells you.

Anyone else who signs in with no invite sees **Create your shop** and gets their own empty shop.

## 5. What a new person sees

| Who | First sign-in |
|---|---|
| Invited helper (owner added their Google email under More → Helpers) | Joins the owner's shop automatically. Sees only Sell. |
| Anyone else | **Create your shop**: shop name, place, a short privacy notice (DPDP Act, 2023) and a tick box. They become the owner of a new empty shop. The agreement is saved with the date and notice version. |

The owner can delete everything at **More → Your account → Delete my account and all shop data** (type the shop name to confirm). It deletes the shop and all its data, the helpers' sign-in records and the owner's own sign-in record, and nothing of any other shop.

## 6. Something is wrong: what to look at

| What you see | Likely cause | Fix |
|---|---|---|
| "Something went wrong" on every screen | A migration was not run, or a Supabase setting is missing | Open `/api/health` and run the migrations it names. The exact message is in Vercel → Logs. |
| Sign-in page says "Sign-in did not finish" | Redirect URL not on the list, Google not switched on, or you are not a test user | Section 2 |
| You sign in and land on "Create your shop" but you already have a shop | You signed in with a different Google account | Sign out (More → Your account, or the Sign out button on that screen) and use the right one |
| `/api/health` says `mode: demo` | The two `NEXT_PUBLIC_SUPABASE_*` settings are missing on this deployment | Section 1; tick the right environment and redeploy |
| New settings seem ignored | The site was not rebuilt | Redeploy |

## 7. Accepted warnings from Supabase's security check

Supabase's advisor lists 7 **SECURITY DEFINER functions that signed-in users can run** (`my_shop`, `i_am_owner`, `i_am_team`, `my_item`, `claim_invite`, `create_shop`, `delete_my_account`). This is on purpose: row-level security rules need the first four, and the other three are the sign-up, invite and delete steps. Each one checks `auth.uid()` and the caller's role inside, and none is runnable without signing in (checked on the real project). No warnings about anonymous access.

## 8. Demo login for reviewers (two accounts, email and password)

Reviewers (faculty) should not need a personal Google account. The sign-in page can show a **Demo login** form next to the Google button. It accepts **exactly two accounts**: one **owner** and one **helper** of "Sri Balaji Stores". **No password is in the code, in GitHub or in a setting.** Supabase keeps and checks the passwords. Any other email is refused by the app before Supabase is even asked.

### Create the two accounts (about 5 minutes)

1. Supabase → **Authentication → Users → Add user → Create new user**. Make two users, each with an email and a **password you choose** (12 or more characters; the link is public, so make them strong). **Tick "Auto Confirm User"** so no email is sent. The emails can be any addresses you like, for example `demo.owner@stocksaathi.test` and `demo.helper@stocksaathi.test`. (If Supabase refuses an address, use two inboxes you own, for example `yourname+owner@gmail.com` and `yourname+helper@gmail.com`.)
2. Run migration `0007_demo_accounts.sql` if you have not (section 3). It makes the demo owner unable to delete the shop and stops anyone removing the demo helper.
3. Supabase → SQL editor → paste `supabase/link_demo_accounts.sql`, change the two emails on the lines marked `CHANGE THIS` to the two emails from step 1, and run it. It joins the owner and the helper to "Sri Balaji Stores". It is safe to run twice. **Do not commit this file with your real emails in it.**
4. Vercel → Settings → Environment Variables: add `DEMO_OWNER_EMAIL` and `DEMO_HELPER_EMAIL` (the same two emails, **not** the passwords), tick Production and Preview, then **redeploy**. Without both variables the Demo login form is hidden.
5. Open `/login`. Under the Google button you see **Demo login**. Sign in as the owner: you see Home with the reorder list. Sign out (More → Your account) and sign in as the helper: you see only the Sell screen, with no prices.
6. Check `/api/health`: `DEMO_LOGIN` should be `true`.

Give the faculty the two emails and passwords **in the submission document, not in GitHub**.

### What a demo account can and cannot do

| | Demo owner | Demo helper |
|---|---|---|
| Sees | Everything an owner sees | Only the Sell screen, no prices |
| Can change | Items, stock, orders, deliveries (as a normal owner) | Record sales only |
| Cannot | **Delete the shop** (refused by the database) and cannot remove the demo helper | Anything owner-only (403) |

If a demo account is not linked to the shop yet, or has the wrong role, the Demo login signs the person out again and says so in plain words, so a reviewer can never end up creating a shop by accident.

### Keeping it safe

- Choose strong passwords. Supabase limits repeated tries from one address. Only two emails can be tried at all.
- After the review: Supabase → Authentication → Users → delete the two demo users (their rows in the shop are removed with them), or remove `DEMO_OWNER_EMAIL` and `DEMO_HELPER_EMAIL` in Vercel and redeploy to hide the form.
- Reviewers share one demo shop. If someone changes stock or items, reset with `supabase/seed.sql` on a fresh project, or simply accept the change.

## 9. Make the Vercel production link public (no Vercel login)

A link asks for a Vercel login for one of two reasons. Check both.

**A. There is no Production deployment yet.** The `main` branch of your repository is empty (all work is on feature branches, and the rules forbid pushing straight to `main`), so Vercel has only built **Preview** deployments, and Preview links are protected. Fix: merge your branch into `main` with a pull request.
1. Push the branch (in your own terminal): `git push -u origin feature/demo-login-and-ai`.
2. On GitHub open **Pull requests → New pull request**, base `main`, compare `feature/demo-login-and-ai` → **Create pull request** → **Merge pull request**.
3. Vercel builds `main` as **Production**. Vercel → your project → **Domains** shows the public name, for example `https://stocksaathi.vercel.app`. That is the link to submit, not the long `stocksaathi-git-feature-...vercel.app` Preview links.

**B. Deployment Protection is on.** Vercel → your project → **Settings → Deployment Protection**.
1. Set **Vercel Authentication** to **Disabled**. (Or keep **Standard Protection**: on current Vercel plans this leaves your production domain public and protects only the long per-deployment links. Disabled is the simplest and is what a public class project needs.)
2. Leave **Password Protection** and **Trusted IPs** off (they are paid features).
3. Save. Open the production link in a **private window**. You should see the StockSaathi sign-in page, not a Vercel login.

Then make sure the production link works end to end:
- The environment variables (section 1, and `DEMO_*` and `AI_*` if you use them) are ticked for **Production**. Variables ticked only for Preview do nothing on `main`.
- Supabase → Authentication → URL Configuration: **Site URL** is the production address and `https://YOUR-PRODUCTION-ADDRESS/auth/callback` is in **Redirect URLs**.
- Open `https://YOUR-PRODUCTION-ADDRESS/api/health` (it must say `"mode": "live"` and `"ok": true`).
- The nightly job (`vercel.json` cron) runs **only on Production**, so it starts working after step A.

The link is public, but the data is not: nobody can read the shop without signing in, and the sign-in is either Google or one of the two demo accounts (see section 8).

## 10. The shop date and "Close the day" (owner on the product team)

Each shop has **one business date**, stored in the database and the same for every person in the shop (`shops.business_date`, migration 0008). It is shown at the top of **Home** ("Shop date: Fri, 13 Nov"). It normally follows the real date (India time). The Forecast Desk works up to the day **before** the shop date, so today's sales are not in the forecast until the day is closed (or the real day ends).

| Button (Home, owner on the product team only) | What it does |
|---|---|
| **Close the day** | Asks once more. Then today's sales and deliveries are final and become history, the shop date moves **forward by one day** (a **Simulated date** badge shows when it is ahead of the real date, with the real date under it), the Forecast Desk runs again at once and saves its rows (`model_forecasts`, `model_scores`, `final_forecasts`) like the nightly job, and the reorder and don't-reorder lists update. The scorecard can then compare yesterday's forecast with what really sold. |
| **Back to real date** (only when the date is ahead) | Asks once more. Goes back to the real date and removes what the simulation made for today and later: **sample sales** (their units go back in stock) and the **saved forecasts** for those days. **Real sales are never removed.** |

- **Who:** the owner on the product team (`users.is_team`, see section 4). The database refuses everybody else (a normal owner, a helper, the demo accounts). The demo owner is **not** on the team on purpose.
- **Sales, deliveries and orders** recorded while the date is ahead are dated with the shop date.
- **The shop date never falls behind the real date.** Once the real date catches up with a simulated date, the shop simply follows the real date again.
- **At most 60 days ahead** of the real date.

### Sample sales for the demo shop (only "Sri Balaji Stores")

- Only the shop marked `is_sample_shop` can ever get them. Every other shop is never touched (the database refuses, and a test checks it).
- Each sample sale is a normal sale row with **`sales.is_sample = true`**, so it can always be told apart: `select * from sales where is_sample;`
- **On Close the day:** when fewer than **5 sales** were recorded that day, a tick box **Fill the day with sample sales** appears.
- **Every night:** the nightly job fills every day up to yesterday that has fewer than 5 sales, from the first day of sales, so the demo shop never has a zero-sales gap. It **stops after 27 Nov 2026** (`SAMPLE_FILL_UNTIL` in `lib/business-day.ts`).
- **The pattern** comes from the shop's own history, not from a made-up table: each item's usual size, how often it sells (so the 3 slow items stay slow), and the weekday effect (Sunday and Monday busier). The same day always gets the same sample sales.
- **Stock:** sample sales lower stock like real ones, so the reorder list reacts, and the owner can record deliveries as usual.
