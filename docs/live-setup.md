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
| `AI_MODE`, `AI_FORECASTER`, `AI_FORECAST_URL`, `AI_FORECAST_KEY` | Optional AI forecasts | `docs/ai-integration.md` | `AI_FORECAST_KEY` is |

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

## 3. Database migrations

Run the files in `supabase/migrations/` **in order** in the Supabase SQL editor: `0001`, `0002`, `0003`, `0004`, `0005`, `0006`. `supabase/seed.sql` adds the demo shop and is optional.

**Status of your project `stocksaathi`:** `0001` and `0002` were applied earlier. `0003`, `0004`, `0005` and `0006` (the speed migration) were applied on 12 Nov 2026 (with your permission) and `/api/health` then reported nothing missing. Your 30 items and 822 sales were not changed. What was missing before is in `docs/migration-audit.md`.

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
