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
```

## Layout

- `lib/forecast/desk.ts`: the Forecast Desk (5 models, check, blend, BR1 to BR6). Pure code, no database. Tests in `lib/forecast/desk.test.ts`.
- `lib/desk-service.ts`: builds each item's sales series and runs the Desk for the shop.
- `lib/data/`: `Store` interface with two versions: `demo.ts` (in memory, sample data) and `supabase.ts` (live, row-level security per shop).
- `app/`: screens (`/sell`, `/reorder`, `/deliveries`, `/more`, `/stock`, `/scorecard`, `/item/[id]`, `/setup/*` for items, distributors, helpers and festival calendar, `/ai`, `/login`) and `app/api/*` routes.
- `lib/auth.ts`: who is signed in. `requireOwner()` / `requireTeam()` for pages, `ownerOnly()` / `teamOnly()` for API routes. Every new owner-only page and route must use one.
- `lib/scorecard.ts`, `lib/prep-time.ts`, `lib/validate.ts`: pure maths and checks, with tests next to them.
- `lib/forecast/ai/`: plug-in system for AI forecasts (off by default). See `docs/ai-integration.md`. AI settings are server-only.
- `supabase/migrations/`, `supabase/seed.sql`: database schema and sample data.

## Business rules to respect

- Only the owner can send orders or change stock, prices and settings. Helpers can only record sales (BR7). The database already enforces this; keep the screens in line with it.
- Record no shopper personal data.
- Demo mode (no Supabase keys) must keep working for every screen. Demo mode has an Owner / Helper switch at the top.
- A helper sees only the Sell screen. New screens and API routes are owner-only unless they are about recording a sale.
