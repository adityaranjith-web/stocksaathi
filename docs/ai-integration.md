# AI forecasts: the AI second opinion

The Forecast Desk (five statistical models, checked and blended) stays the source of truth. An AI model is added as a **second opinion** that has to prove itself first. Nothing here changes an order unless you switch it on, and even then only after the AI has beaten the Forecast Desk on real sales.

Ready to use: **Google Gemini** (it has a free plan). A practice model (`mock`, no account) and your own web service (`http`) also work.

## The three stages

| Stage | `AI_MODE` | What happens | Do orders change? |
|---|---|---|---|
| Off (default) | not set, or `off` | Nothing runs. Nothing is sent anywhere. | No |
| **Shadow** | `shadow` | The AI is asked for every item. Its answer is saved next to the Forecast Desk's own forecast, shown on the **Why this number** screen as **AI second opinion**, and later compared with what really sold. | **No** |
| Blend | `blend` | Same as shadow, and once the AI passes the checks below, it is mixed into the forecast for items that have a fresh AI forecast. | Yes, only after it passes |

**Shadow is where to start and where to stay for at least 14 days.** In shadow the AI can never change an order, whatever it answers (a test in `lib/forecast/ai/gemini.test.ts` proves this with an AI that answers 99 for every item).

### When the AI is asked in shadow mode

- **Every night** by the nightly job (`/api/cron/nightly`), right after the Forecast Desk rows are saved. Without this, 14 different days of forecasts would need the owner to tap a button 14 times.
- **When the owner taps "Run AI forecast now"** (More → AI forecasts). Asking twice on the same day replaces that day's row; it never doubles it.

## If the AI fails, or the free limit is reached

The app carries on with the Forecast Desk and shows the owner **no error**:

| What happens | What the owner sees | What the app does |
|---|---|---|
| The free limit is used up (the service answers 429) | Nothing on the reorder list or Why screen. On the AI forecasts screen after a tap: "The AI could not answer for every item right now. Your orders still use the Forecast Desk, as always." (a calm line, not a red error) | Stops asking at once for this run (nightly: for all shops). The rows already answered are kept. Tomorrow it asks again. |
| The service is busy (503), slow (20 s per try), cut off or garbled, or refuses the key | The same calm line | A call that may pass later (503 or another 5xx, a dropped connection, an empty or garbled answer, a 429 that says "try again in a few seconds") is **tried again after 2 s, then after 4 s**, as long as there is time left. A refused key (400, 401, 403) is not tried again. A call that still fails loses only its 5 items; after two failed calls in a row the run stops. |
| One item's answer is missing or silly (negative, not a number) | The same calm line | That item gets no AI row. The others are saved. |
| The database cannot save the AI rows | The same calm line | Logs the problem and carries on. |
| The nightly job | Nothing | The Forecast Desk rows are saved **first**. An AI problem is only counted in the job's answer (`"ai": { "saved", "failed", "stopped" }`) and never makes the job fail. |

Only the owner's **Why this number** screen shows an AI box, and only when an AI forecast exists for that item. With no AI forecast the box is simply not there.

## Google Gemini: free limits (checked 12 Nov 2026)

- Google's own page ([rate limits](https://aistudio.google.com/docs/rate-limits)) **no longer publishes the free-tier numbers** for the text models. It says to look at your project's limits in [Google AI Studio](https://aistudio.google.com/rate-limit). Limits apply **per Google Cloud project**, not per key, and daily limits reset at midnight Pacific time. Check the page before you rely on a number.
- Third-party guides that tracked the figures give about **500 requests per day and 10 requests per minute** for the current Flash-Lite models (older 2025 guides say 1,000 per day and 15 per minute for the older 2.5 model). Treat these as estimates.
- **How much StockSaathi uses:** the app asks for **5 items in one call**, with a pause of 1.5 seconds between calls. A shop with 30 items uses **6 calls per run** (more when a busy call is tried again), so one run a night plus a few button taps stays far below the estimated limits.
- **Privacy on the free tier:** Google's pricing page says that on the free tier **content is used to improve Google's products** (on the paid tier it is not). What the app sends is only item names, categories, pack sizes, prices, stock and daily unit sales (see below): no shop, owner, helper, supplier or customer details. If you do not want even that to be used by Google, add billing to the Google project (paid tier) before switching it on for a real shop. For a class project with sample data the free tier is fine.
- Model: `gemini-3.5-flash-lite` (Google's cheapest, listed as free of charge). Change it with `AI_GEMINI_MODEL` if Google retires it (for example to `gemini-3.1-flash-lite`).

### Get a key (about 3 minutes)

1. Open [Google AI Studio](https://aistudio.google.com/) and sign in with a Google account.
2. **Get API key** → create a key. Copy it. Treat it like a password: never paste it into chat, a file or GitHub.
3. Put it in Vercel (below). Never use a name starting with `NEXT_PUBLIC_`.

## Settings to add in Vercel (server only)

Vercel → your project → **Settings → Environment Variables → Add**. Tick **Production** and **Preview**, tick **Sensitive** for the key, then **redeploy**.

| Name | Value | Secret? |
|---|---|---|
| `AI_MODE` | `shadow` | No |
| `AI_FORECASTER` | `gemini` | No |
| `AI_FORECAST_KEY` | the Gemini API key from Google AI Studio | **Yes** |
| `AI_GEMINI_MODEL` | optional. Leave it out to use `gemini-3.5-flash-lite` | No |

For the other providers:

| Name | Meaning |
|---|---|
| `AI_FORECASTER` | `mock` (a practice model, no account needed), `http` (your own AI service) or `gemini` |
| `AI_FORECAST_URL` | For `http`: the address of the service. Must start with `https://` (plain `http://` is allowed only for localhost). |
| `AI_FORECAST_KEY` | For `gemini`: the key (required). For `http`: a secret sent as `Authorization: Bearer <key>` (optional). |

The key is read in **one file only** (`lib/forecast/ai/registry.ts`) and used in one place (`lib/forecast/ai/providers.ts`), always on the server. It goes to Google in a request header, never in the address, and is never logged. `lib/secrets.test.ts` fails if it shows up anywhere else or with a `NEXT_PUBLIC_` name. To try everything with no account at all: `AI_MODE=shadow` and `AI_FORECASTER=mock`.

The nightly job uses the same settings, so the AI second opinion runs every night once `AI_MODE` and the key are set (the nightly job itself needs `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`, see `docs/nightly-job.md`). The deployment's AI settings apply to **every shop** on the deployment.

## The checks an AI model must pass (`lib/forecast/ai/evaluate.ts`)

1. Forecasts from at least **14 different days**.
2. At least **50 checked forecasts** (a forecast is checked after all its days have passed).
3. It misses at least **10% fewer units** than the Forecast Desk made on the same day.

Then, in blend mode:
- The AI gets **30%** of the forecast, never more than **40%**.
- Rule BR6 still applies: the result is capped at double the 28-day average when no festival is marked.
- The order is worked out by the same BR1 to BR4 rules as always (`decide()` in the Desk). The Desk code is not changed.
- The Why this number screen shows a line: "AI second opinion mixed in at 30%".

If the AI stops being good, it falls out of the checks and orders go back to the Forecast Desk on their own.

## What is sent to the AI

One entry per item (`lib/forecast/ai/payload.ts`). Gemini gets 5 items in one call:

```json
{
  "asOf": "2026-11-10",
  "horizonDays": 9,
  "item": { "id": "I004", "name": "Sugar", "category": "Staples", "pack": "1 kg", "price": 46,
            "leadTimeDays": 2, "orderCoverDays": 7, "currentStock": 12, "onOrder": 0 },
  "salesDaily": [ { "date": "2026-09-16", "qty": 9 }, "... up to 56 days, oldest first ..." ],
  "calendar": [ { "date": "2026-11-08", "name": "Deepavali", "upliftPct": 40 } ],
  "desk": { "blendUnitsPerDay": 9.45, "modelUnitsPerDay": { "M1": 9.6, "M2": 8.7, "M3": 9.0, "M4": 9.4, "M5": 11.0 }, "confidence": "Medium" }
}
```

It holds **no shop name, locality, owner, helper, distributor, salesman or phone number** (BRD section 7). Two tests fail if any of these slip in: `lib/forecast/ai/ai.test.ts` (the request) and `lib/forecast/ai/gemini.test.ts` (the actual text sent to Gemini, for 12 real items). The same tests check that the key is not in the request body or the address.

## What the AI must answer

```json
{ "unitsPerDay": 9.8, "low": 8.1, "high": 11.4, "note": "optional one-line reason" }
```

`unitsPerDay` is the average units per day over the next `horizonDays`. `low`, `high` and `note` are optional. Answers that are missing, negative, not numbers, or silly (over 100,000) are rejected and counted as failed for that item. Gemini is asked for JSON in a fixed shape, and every answer is checked again before it is saved. The `note` is not saved or shown.

## What the owner sees

- **Why this number** (owner only): a box **AI second opinion** with the AI's units per day (and range), what the Forecast Desk said on the day the AI was asked, and one of two lines: "For checking only. It does not change your order." or, once it has passed the checks in blend mode, "The AI has passed the checks, so it is mixed into this order."
- **More → AI forecasts**: the status, the "Run AI forecast now" button and **How good is it?** (the 3 checks above, with numbers).

## Connecting a different model

1. **A web service:** build a small service that accepts the request above and returns the answer above. Set `AI_FORECASTER=http`, `AI_FORECAST_URL=https://...`, `AI_FORECAST_KEY=...`, `AI_MODE=shadow`.
2. **Another kind of provider:** add one object with `id`, `name` and a `forecast(request)` function (and, to save requests, an optional `forecastMany(requests)` that answers several items in one call) in `lib/forecast/ai/providers.ts` and one line in `lib/forecast/ai/registry.ts`. Throw `AiUnavailableError("...", "limit" | "error")` when the service cannot be used; the rest (stopping, no error shown, nightly job safe) is already handled.

Run it for at least 14 days. Watch **How good is it?**. When it shows **Passed**, set `AI_MODE=blend`.

## Files

| File | Job |
|---|---|
| `lib/forecast/ai/types.ts` | The request, answer and provider shapes; `AiUnavailableError` |
| `lib/forecast/ai/payload.ts` | Builds the request (privacy-safe) |
| `lib/forecast/ai/providers.ts` | `mock`, `http` and `gemini` providers, answer checking |
| `lib/forecast/ai/registry.ts` | Reads the settings above (the only place the key is read) |
| `lib/forecast/ai/run.ts` | Asks the provider about a whole shop: batches, stops on the free limit, never throws for an AI problem |
| `lib/forecast/ai/shadow.ts` | The button's run: calls `run.ts` and saves the answers |
| `lib/nightly.ts` | The nightly job; after the Forecast Desk rows it asks the AI (own time limit of 40 s) |
| `lib/forecast/ai/evaluate.ts` | Checks the AI against real sales; the pass rules; the 30% mix |
| `lib/forecast/ai/apply.ts` | Mixes the AI into one item's result |
| `app/api/ai/run/route.ts` | The "Run AI forecast now" button (owner only) |
| `app/ai/page.tsx` | Status and accuracy screen |
| `app/item/[id]/page.tsx` | Why this number, with the AI second opinion box |
| `supabase/migrations/0003_...sql` | `ai_forecasts` table (private to each shop) |

## Not built yet

- Per-item or per-category choice of model.
- A per-shop switch: the AI settings apply to the whole deployment.
- A daily cost cap beyond the free limit. On the free plan Google stops the calls itself (and the app handles that). On a paid plan each run is about 6 calls per 30 items.
