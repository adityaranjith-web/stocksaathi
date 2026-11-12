// The nightly job's web handler: checks the secret, then runs the job. SERVER ONLY.
// Vercel calls the route once a day with the header  Authorization: Bearer <CRON_SECRET>  when CRON_SECRET is set.
import { createHash, timingSafeEqual } from "node:crypto";
import { runNightly, type NightlyDb } from "@/lib/nightly";

if (typeof window !== "undefined") throw new Error("The nightly job runs on the server only.");

const MIN_SECRET_LENGTH = 16;

/** True only when the header is exactly "Bearer <secret>". Compares hashes, so the time taken reveals nothing. */
export function isAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < MIN_SECRET_LENGTH || !header) return false;
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function handleNightly(req: Request, deps: { secret: string | undefined; makeDb: () => NightlyDb; runDate?: string }): Promise<Response> {
  // No secret, or a weak one: the route stays shut. It is never open by accident.
  if (!deps.secret || deps.secret.length < MIN_SECRET_LENGTH) {
    return json({ error: `The nightly job is switched off: set CRON_SECRET (at least ${MIN_SECRET_LENGTH} characters).` }, 503);
  }
  if (!isAuthorized(req.headers.get("authorization"), deps.secret)) return json({ error: "Not allowed." }, 401);

  let db: NightlyDb;
  try {
    db = deps.makeDb();
  } catch (e) {
    return json({ error: (e as Error).message }, 503);
  }
  try {
    const summary = await runNightly(db, deps.runDate);
    // 500 when any shop failed, so the problem shows up in the Vercel cron log. The shops that worked are saved.
    return json({ ok: summary.failedShops === 0, ...summary }, summary.failedShops === 0 ? 200 : 500);
  } catch (e) {
    console.error(`nightly: job failed: ${(e as Error).message}`);
    return json({ ok: false, error: "The nightly job failed. See the Vercel logs." }, 500);
  }
}
