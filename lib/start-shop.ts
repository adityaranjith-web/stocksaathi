// "Start your shop": the ready list of common kirana items, when the Home card shows, and the checks for what the owner types.
// Pure code, tested in start-shop.test.ts. Messages are plain English because they are shown on screen.
import type { Checked } from "@/lib/validate";

// ---------- the words on the three screens and the Home card ----------
export const START_COPY = {
  cardTitle: "Start your shop",
  cardLine: "Three short steps, and StockSaathi can tell you what to reorder.",
  steps: [
    { title: "Add items", text: "Tick what you sell from a ready list, or add your own.", button: "Add items", href: "/start/items" },
    { title: "Usual sales and stock", text: "About how many sell each day, and how many you have now.", button: "Enter numbers", href: "/start/numbers" },
    { title: "Past sales (optional)", text: "Upload or type the last 7 days. The forecast learns faster.", button: "Add past sales", href: "/start/history" },
  ],
  items: { title: "Add items", help: "Tick what you sell. You can rename an item or add your own." },
  numbers: { title: "Usual sales and stock", help: "A rough guess is fine. Your own sales will take over." },
  history: { title: "Past sales", help: "Optional. It helps the forecast learn faster." },
} as const;

// ---------- the ready list (a name and a typical unit; the owner can rename either) ----------
export interface StarterItem { name: string; pack: string }

export const STARTER_ITEMS: StarterItem[] = [
  { name: "Toned Milk", pack: "500 ml" },
  { name: "Curd", pack: "400 g" },
  { name: "Butter", pack: "100 g" },
  { name: "Paneer", pack: "200 g" },
  { name: "Eggs", pack: "6 eggs" },
  { name: "Bread", pack: "400 g" },
  { name: "Sugar", pack: "1 kg" },
  { name: "Whole Wheat Atta", pack: "5 kg" },
  { name: "Rice", pack: "5 kg" },
  { name: "Basmati Rice", pack: "1 kg" },
  { name: "Toor Dal", pack: "1 kg" },
  { name: "Moong Dal", pack: "500 g" },
  { name: "Chana Dal", pack: "500 g" },
  { name: "Urad Dal", pack: "500 g" },
  { name: "Rava (Sooji)", pack: "500 g" },
  { name: "Poha", pack: "500 g" },
  { name: "Cooking Oil", pack: "1 L" },
  { name: "Groundnut Oil", pack: "1 L" },
  { name: "Coconut Oil", pack: "500 ml" },
  { name: "Iodised Salt", pack: "1 kg" },
  { name: "Jaggery", pack: "500 g" },
  { name: "Tea Powder", pack: "250 g" },
  { name: "Coffee Powder", pack: "200 g" },
  { name: "Turmeric Powder", pack: "100 g" },
  { name: "Red Chilli Powder", pack: "100 g" },
  { name: "Coriander Powder", pack: "100 g" },
  { name: "Mustard Seeds", pack: "100 g" },
  { name: "Glucose Biscuits", pack: "100 g" },
  { name: "Cream Biscuits", pack: "100 g" },
  { name: "Potato Chips", pack: "50 g" },
  { name: "Instant Noodles", pack: "70 g" },
  { name: "Soft Drink", pack: "750 ml" },
  { name: "Packaged Drinking Water", pack: "1 L" },
  { name: "Bath Soap", pack: "100 g" },
  { name: "Detergent Powder", pack: "1 kg" },
  { name: "Dishwash Bar", pack: "250 g" },
  { name: "Toothpaste", pack: "100 g" },
  { name: "Shampoo Sachets", pack: "strip of 10" },
  { name: "Hair Oil", pack: "100 ml" },
  { name: "Matchbox", pack: "pack of 10" },
  { name: "Onion", pack: "1 kg" },
  { name: "Potato", pack: "1 kg" },
];

// ---------- when the Home card shows ----------
export interface StartCardInput {
  items: number; // active items in the shop
  itemsWithoutEstimate: number; // items that have no "sells per day" estimate yet
  salesCount: number; // sale entries in the last 56 days (0 for a brand new shop)
}

/**
 * Home shows the "Start your shop" card INSTEAD of the normal panels when:
 *  - the shop has fewer than 3 items (the rule the owner asked for), or
 *  - the owner has added items but has not finished step 2 and nothing has been sold yet (a brand new shop in the middle
 *    of the guide, so it is not left on empty panels).
 * A shop that has sales, like the demo shop and every existing shop, never sees it unless it has fewer than 3 items.
 */
export function showStartCard(s: StartCardInput): boolean {
  if (s.items < 3) return true;
  return s.itemsWithoutEstimate > 0 && s.salesCount === 0;
}

/** The three steps and which are done (the tick on each). Past sales are optional. */
export function startSteps(s: StartCardInput): { addItems: boolean; numbers: boolean; history: boolean } {
  return { addItems: s.items >= 1, numbers: s.items >= 1 && s.itemsWithoutEstimate === 0, history: s.salesCount > 0 };
}

// ---------- checks for what the owner types ----------
const text = (x: unknown, max: number) => (typeof x === "string" ? x.trim().replace(/\s+/g, " ").slice(0, max) : "");
const blank = (x: unknown) => x === undefined || x === null || (typeof x === "string" && x.trim() === "");
const number = (x: unknown) => (typeof x === "number" ? x : typeof x === "string" && /^\d+(\.\d{1,2})?$/.test(x.trim()) ? parseFloat(x) : NaN);

export const MAX_START_ITEMS = 100;

/** Step 1: the ticked and added items. Blank names are dropped, repeated names (any capitals) are kept once. */
export function checkStarterItems(body: unknown): Checked<StarterItem[]> {
  const list = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) return { ok: false, error: "Tick at least one item." };
  const seen = new Set<string>();
  const items: StarterItem[] = [];
  for (const raw of list) {
    const name = text((raw as { name?: unknown } | null)?.name, 80);
    if (!name) continue;
    if (name.length < 2) return { ok: false, error: "Each item name needs at least 2 letters." };
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    items.push({ name, pack: text((raw as { pack?: unknown }).pack, 30) });
  }
  if (!items.length) return { ok: false, error: "Tick at least one item." };
  if (items.length > MAX_START_ITEMS) return { ok: false, error: `Add up to ${MAX_START_ITEMS} items at a time.` };
  return { ok: true, value: items };
}

export interface StartNumbers {
  distributorName: string; // "" = the shop's own distributor ("My distributor" is made if there is none)
  leadTimeDays: number;
  rows: { itemId: string; perDay: number; stock: number; price: number | null }[];
}

/**
 * Step 2: for each item, about how many sell per day and how many are in the shop now. A row with both boxes empty is skipped
 * (that item can be done later). A row with only one box filled is a mistake the owner can fix.
 */
export function checkStartNumbers(body: unknown): Checked<StartNumbers> {
  const b = (body ?? {}) as Record<string, unknown>;
  const lead = blank(b.leadTimeDays) ? 2 : number(b.leadTimeDays);
  if (!Number.isInteger(lead) || lead < 0 || lead > 60) return { ok: false, error: "Lead time is the days from ordering to delivery (0 to 60)." };
  const rows: StartNumbers["rows"] = [];
  if (!Array.isArray(b.rows)) return { ok: false, error: "Fill in the numbers for at least one item." };
  for (const raw of b.rows) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const itemId = text(r.itemId, 80);
    if (!itemId) continue;
    if (blank(r.perDay) && blank(r.stock)) continue;
    if (blank(r.perDay) || blank(r.stock)) return { ok: false, error: "Fill in both numbers for each item you start, or leave both empty." };
    const perDay = number(r.perDay);
    if (!Number.isFinite(perDay) || perDay < 0 || perDay > 100000) return { ok: false, error: "About how many sell per day: enter a number from 0 up, for example 8 or 2.5." };
    const stock = number(r.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) return { ok: false, error: "How many in the shop now: enter a whole number from 0 up." };
    const price = blank(r.price) ? null : number(r.price);
    if (price !== null && (!Number.isFinite(price) || price < 0 || price > 100000)) return { ok: false, error: "Price: enter rupees, for example 45 or 45.50." };
    rows.push({ itemId, perDay: Math.round(perDay * 100) / 100, stock, price });
  }
  if (!rows.length) return { ok: false, error: "Fill in the numbers for at least one item." };
  return { ok: true, value: { distributorName: text(b.distributorName, 80), leadTimeDays: lead, rows } };
}

/** Step 3: past sales typed in a day-by-day table. Empty boxes are skipped. Only days in the given range are accepted. */
export function checkStartHistory(body: unknown, range: { from: string; to: string }): Checked<{ itemId: string; date: string; qty: number }[]> {
  const list = (body as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(list)) return { ok: false, error: "Type the sales for at least one day." };
  const rows: { itemId: string; date: string; qty: number }[] = [];
  for (const raw of list) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const itemId = text(r.itemId, 80);
    const date = text(r.date, 10);
    if (!itemId || blank(r.qty)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < range.from || date > range.to) return { ok: false, error: "Past sales can only be for the last 7 days." };
    const qty = number(r.qty);
    if (!Number.isInteger(qty) || qty < 0 || qty > 100000) return { ok: false, error: "Sales must be whole numbers from 0 up." };
    if (qty > 0) rows.push({ itemId, date, qty });
  }
  if (!rows.length) return { ok: false, error: "Type the sales for at least one day." };
  return { ok: true, value: rows };
}
