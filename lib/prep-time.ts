// Order preparation timer (KPI 2): time from opening the reorder list to tapping Share.

/** Longest time we accept for one order. Anything longer means the phone was left open, so it is not counted. */
export const MAX_PREP_SECONDS = 2 * 60 * 60;

/** "45 s", "1 min 12 s", "5 min". */
export function formatPrepTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r} s`;
  return r === 0 ? `${m} min` : `${m} min ${r} s`;
}

/** "0:42" style clock for the live timer. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Average of the orders that have a time. Returns null when none do. */
export function averagePrepSeconds(list: (number | null | undefined)[]): number | null {
  const ok = list.filter((x): x is number => typeof x === "number" && x >= 0 && x <= MAX_PREP_SECONDS);
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
}

/** Cleans a time sent by the phone: whole seconds, or null when it is missing or not believable. */
export function cleanPrepSeconds(x: unknown): number | null {
  if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > MAX_PREP_SECONDS) return null;
  return Math.round(x);
}
