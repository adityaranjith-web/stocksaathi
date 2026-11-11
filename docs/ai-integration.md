# AI forecasts: how to plug in an AI model later

The Forecast Desk (five statistical models, checked and blended) stays the source of truth. An AI model is added as a **second opinion** that has to prove itself first. Nothing here changes an order unless you switch it on, and even then only after the AI has beaten the Forecast Desk on real sales.

## The three stages

| Stage | `AI_MODE` | What happens | Do orders change? |
|---|---|---|---|
| Off (default) | not set, or `off` | Nothing runs. Nothing is sent anywhere. | No |
| Shadow | `shadow` | The owner taps **Run AI forecast now** (More → AI forecasts). The app asks the AI for every item and saves its answer next to the Forecast Desk's own forecast. Later, when the days have passed, both are compared with what really sold. | No |
| Blend | `blend` | Same as shadow, and once the AI passes the checks below, it is mixed into the forecast for items that have a fresh AI forecast. | Yes, only after it passes |

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

## Settings (server only)

Set these in Vercel → Project → Settings → Environment Variables, then redeploy. **Never** give them a name starting with `NEXT_PUBLIC_`, and never put them in code.

| Name | Meaning |
|---|---|
| `AI_MODE` | `off` (default), `shadow` or `blend` |
| `AI_FORECASTER` | `mock` (a practice model, no account needed) or `http` (your own AI service) |
| `AI_FORECAST_URL` | For `http`: the address of the service. Must start with `https://` (plain `http://` is allowed only for localhost). |
| `AI_FORECAST_KEY` | For `http`: a secret sent as `Authorization: Bearer <key>`. Optional. |

To try it without any account: `AI_MODE=shadow` and `AI_FORECASTER=mock`.

## What is sent to the AI

One request per item (`lib/forecast/ai/payload.ts`):

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

It holds **no shop name, locality, owner, helper, distributor, salesman or phone number** (BRD section 7). A test (`lib/forecast/ai/ai.test.ts`) fails if any of these slip in.

## What the AI must answer

```json
{ "unitsPerDay": 9.8, "low": 8.1, "high": 11.4, "note": "optional one-line reason" }
```

`unitsPerDay` is the average units per day over the next `horizonDays`. `low`, `high` and `note` are optional. Answers that are missing, negative, not numbers, or silly (over 100,000) are rejected and counted as failed for that item.

## Connecting a real model

1. Build a small web service that accepts the request above and returns the answer above. It can call any model you like (a Claude model, a time-series model, your own).
2. Set `AI_FORECASTER=http`, `AI_FORECAST_URL=https://...`, `AI_FORECAST_KEY=...`, `AI_MODE=shadow`.
3. Run it daily for at least 14 days. Watch **How good is it?** on the AI forecasts screen.
4. When it shows **Passed**, set `AI_MODE=blend`.

To add another kind of provider (not a web service), add one object with `id`, `name` and a `forecast(request)` function in `lib/forecast/ai/providers.ts` and one line in `lib/forecast/ai/registry.ts`.

## Files

| File | Job |
|---|---|
| `lib/forecast/ai/types.ts` | The request, answer and provider shapes |
| `lib/forecast/ai/payload.ts` | Builds the request (privacy-safe) |
| `lib/forecast/ai/providers.ts` | `mock` and `http` providers, answer checking |
| `lib/forecast/ai/registry.ts` | Reads the settings above |
| `lib/forecast/ai/shadow.ts` | Runs the AI over all items and saves the answers |
| `lib/forecast/ai/evaluate.ts` | Checks the AI against real sales; the pass rules; the 30% mix |
| `lib/forecast/ai/apply.ts` | Mixes the AI into one item's result |
| `app/api/ai/run/route.ts` | The "Run AI forecast now" button (owner only) |
| `app/ai/page.tsx` | Status and accuracy screen |
| `supabase/migrations/0003_...sql` | `ai_forecasts` table (private to each shop) |

## Not built yet

- A **nightly** run. Today the owner taps the button. The BRD plans a daily Vercel job for the Forecast Desk; the AI run can join it. A job has no signed-in user, so it needs a server-side key for the database. Keep that key only in server settings.
- Per-item or per-category choice of model.
- Cost limits. Each run makes one AI call per item. With 30 items that is 30 calls.
