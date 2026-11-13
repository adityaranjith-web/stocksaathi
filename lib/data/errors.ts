// Two different reasons a signed-in screen cannot open, kept apart so each gets the right screen.

/** The person is not signed in, or is signed in but has no shop yet. Normal situations, not faults. */
export class AccessError extends Error {
  constructor(public code: "signed-out" | "no-shop") {
    super(code === "signed-out" ? "Not signed in" : "This Google account has no shop yet");
  }
}

/** The database or its set-up is wrong (a migration was not run, a key is missing). A fault the owner of the project must fix. */
export class SetupError extends Error {
  constructor(detail: string) {
    super(detail);
  }
}

/** Turns a raw database message into a sentence that says which migration to run. */
export function setupMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (/claim_invite|helper_invites|is_team|users\.email|prep_seconds|ai_forecasts/.test(m)) return "The database is out of date: run migration 0003 (see docs/live-setup.md). Detail: " + raw;
  if (/horizon_days/.test(m)) return "The database is out of date: run migration 0004 (see docs/live-setup.md). Detail: " + raw;
  if (/est_daily_sales/.test(m)) return "The database is out of date: run migration 0010 (see docs/live-setup.md). Detail: " + raw;
  if (/shop_snapshot|daily_sales/.test(m)) return "The database is out of date: run migration 0006 (see docs/live-setup.md). Detail: " + raw;
  if (/create_shop|delete_my_account|consented_at|consent_version/.test(m)) return "The database is out of date: run migration 0005 (see docs/live-setup.md). Detail: " + raw;
  return raw;
}
