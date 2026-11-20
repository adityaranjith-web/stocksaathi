// The moment a sale was tapped, sent by the phone when the sale was saved offline (see lib/offline-queue.ts).
// The server uses it to recognise a repeat of the same sale. Anything odd is ignored (the sale is then saved as a normal one).

const MAX_AGE_MS = 14 * 24 * 3600 * 1000; // a phone can be offline for days, but not for ever
const MAX_AHEAD_MS = 5 * 60 * 1000; // a phone clock that is a little fast

/** The tap time as a Date, or null when the value is missing, not a whole number, too old, or in the future. */
export function cleanTapTime(raw: unknown, now: number = Date.now()): Date | null {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  if (raw < now - MAX_AGE_MS || raw > now + MAX_AHEAD_MS) return null;
  return new Date(raw);
}
