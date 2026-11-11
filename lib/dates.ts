import { addDays } from "@/lib/forecast/desk";

/** Today's date in India (YYYY-MM-DD). */
export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
/** The forecast uses complete days only: sales up to yesterday. */
export function asOfDay(): string {
  return addDays(todayIST(), -1);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
export function niceDate(d: string): string {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}
