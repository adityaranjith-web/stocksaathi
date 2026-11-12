// Checks for what the owner types on the set-up screens. Used by the screens and again by the API routes.
// Messages are in plain English because they are shown on screen.
import type { CalendarDay } from "@/lib/forecast/desk";
import type { DistributorInput, ItemInput } from "@/lib/data/types";

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const text = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");
const whole = (x: unknown) => (typeof x === "number" && Number.isInteger(x) ? x : typeof x === "string" && /^\d+$/.test(x.trim()) ? parseInt(x, 10) : NaN);
const money = (x: unknown) => (typeof x === "number" ? x : typeof x === "string" && /^\d+(\.\d{1,2})?$/.test(x.trim()) ? parseFloat(x) : NaN);

export function checkItem(body: unknown): Checked<ItemInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = text(b.name, 80);
  if (!name) return { ok: false, error: "Enter the item name." };
  const price = money(b.price);
  if (!Number.isFinite(price) || price < 0 || price > 100000) return { ok: false, error: "Enter a price in rupees, for example 45 or 45.50." };
  const distributorId = text(b.distributorId, 80);
  if (!distributorId) return { ok: false, error: "Choose a distributor." };
  const leadTimeDays = whole(b.leadTimeDays);
  if (!(leadTimeDays >= 0 && leadTimeDays <= 60)) return { ok: false, error: "Lead time is the number of days from ordering to delivery (0 to 60)." };
  const minSafetyStock = whole(b.minSafetyStock);
  if (!(minSafetyStock >= 0 && minSafetyStock <= 100000)) return { ok: false, error: "Minimum safety stock must be 0 or more." };
  const orderCoverDays = whole(b.orderCoverDays);
  if (!(orderCoverDays >= 1 && orderCoverDays <= 60)) return { ok: false, error: "Order cover must be 1 to 60 days." };
  const openingStock = b.openingStock === undefined || b.openingStock === "" ? 0 : whole(b.openingStock);
  if (!(openingStock >= 0 && openingStock <= 1000000)) return { ok: false, error: "Opening stock must be 0 or more." };
  return { ok: true, value: { name, category: text(b.category, 60), pack: text(b.pack, 40), price, distributorId, leadTimeDays, minSafetyStock, orderCoverDays, openingStock } };
}

export function checkDistributor(body: unknown): Checked<DistributorInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = text(b.name, 80);
  if (!name) return { ok: false, error: "Enter the distributor name." };
  const whatsapp = text(b.whatsapp, 20);
  if (whatsapp && !/^\+?[0-9 ]{10,16}$/.test(whatsapp)) return { ok: false, error: "Enter the WhatsApp number with digits only, for example +91 98765 43210." };
  return { ok: true, value: { name, supplies: text(b.supplies, 120), salesman: text(b.salesman, 60), whatsapp, visitDay: text(b.visitDay, 20) } };
}

export function checkEmail(x: unknown): Checked<string> {
  const email = text(x, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a full Google email, for example name@gmail.com." };
  return { ok: true, value: email };
}

export function checkCalendarDay(body: unknown): Checked<CalendarDay> {
  const b = (body ?? {}) as Record<string, unknown>;
  const date = text(b.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z"))) return { ok: false, error: "Choose a date." };
  const name = text(b.name, 60);
  if (!name) return { ok: false, error: "Enter the festival or holiday name." };
  const upliftPct = whole(b.upliftPct);
  if (!(upliftPct >= 0 && upliftPct <= 200)) return { ok: false, error: "Extra sales must be between 0% and 200%." };
  return { ok: true, value: { date, name, upliftPct } };
}

/** "Create your shop" (first sign-in): the shop name, where it is, and a yes to the privacy notice. */
export function checkShop(body: unknown): Checked<{ name: string; locality: string; consent: true }> {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = text(b.name, 200);
  if (name.length < 2 || name.length > 80) return { ok: false, error: "The shop name must be 2 to 80 characters." };
  const locality = text(b.locality, 200);
  if (locality.length > 80) return { ok: false, error: "The place must be 80 characters or fewer." };
  if (b.consent !== true) return { ok: false, error: "Please tick the box to agree to the privacy notice." };
  return { ok: true, value: { name, locality, consent: true } };
}
