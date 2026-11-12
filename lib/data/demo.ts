// Demo mode: the Session 6 sample data, held in memory on the server.
// Dates are shifted so the last day of sample data is always yesterday.
// Changes (sales, deliveries, orders, items, helpers, calendar) last until the server restarts.
// Roles: the demo has an Owner / Helper switch at the top of the screen. It is kept in a cookie and used only here.
import { cookies } from "next/headers";
import raw from "./demo-data.json";
import { addDays, type CalendarDay } from "@/lib/forecast/desk";
import { asOfDay, daysBetween, todayIST } from "@/lib/dates";
import { effectiveBusinessDate, MAX_DAYS_AHEAD } from "@/lib/business-day";
import type {
  AiForecastRow, BusinessDay, CloseDayResult, DeliveryRecord, Distributor, DistributorInput, Helper, ImportResult, ImportRow, Item, ItemInput,
  Me, OpenOrder, OrderRecord, Sale, Shop, Store,
} from "./types";

interface DemoOrder { orderId: string; distributorId: string; date: string; lines: { itemId: string; qty: number }[]; delivered: boolean; prepSeconds: number | null }
interface DemoState {
  items: Item[];
  distributors: Distributor[];
  calendar: CalendarDay[];
  sales: (Sale & { sample?: boolean })[]; // sample = made by "Close the day" for the demo shop
  /** The shop's own "today" when days were closed ahead of the real date; null follows the real date. */
  businessDate: string | null;
  deliveries: DeliveryRecord[];
  orders: DemoOrder[];
  helpers: Helper[];
  aiRows: AiForecastRow[];
  nextOrder: number;
  nextItem: number;
  nextDistributor: number;
  nextHelper: number;
}

export const DEMO_ROLE_COOKIE = "ss_role";

const g = globalThis as unknown as { __stocksaathiDemo?: DemoState };

function load(): DemoState {
  const shift = daysBetween(raw.lastDataDay, asOfDay());
  return {
    items: raw.items.map((i) => ({ ...i })),
    distributors: raw.distributors.map((d) => ({ ...d })),
    calendar: raw.calendar.map((c) => ({ ...c })),
    sales: raw.sales.map(([date, itemId, qty]) => ({ date: addDays(date as string, shift), itemId: itemId as string, qty: qty as number })),
    businessDate: null,
    deliveries: [],
    orders: [],
    helpers: [{ id: "U02", name: "Karthik", email: "karthik@example.com", status: "Active" }],
    aiRows: [],
    nextOrder: 9,
    nextItem: 101,
    nextDistributor: 51,
    nextHelper: 10,
  };
}
function state(): DemoState {
  if (!g.__stocksaathiDemo) g.__stocksaathiDemo = load();
  return g.__stocksaathiDemo;
}

/** The shop's business date: never behind the real date. */
const bizDate = () => effectiveBusinessDate(state().businessDate, todayIST());

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const demoStore: Store = {
  mode: "demo",
  async getMe(): Promise<Me> {
    const role = (await cookies()).get(DEMO_ROLE_COOKIE)?.value === "helper" ? "helper" : "owner";
    const who = raw.users.find((u) => u.role === role);
    return { name: who?.name ?? role, role, isTeam: role === "owner" };
  },
  async getBusinessDay(): Promise<BusinessDay> {
    const date = bizDate();
    return { date, realDate: todayIST(), simulated: date > todayIST(), sampleShop: true, salesToday: state().sales.filter((x) => x.date === date).length };
  },
  async closeDay(day, sample): Promise<CloseDayResult> {
    const s = state();
    const date = bizDate();
    if (day !== date) throw new Error("The shop date has changed. Reload the page and try again.");
    if (addDays(date, 1) > addDays(todayIST(), MAX_DAYS_AHEAD)) throw new Error("The shop date can be at most 60 days ahead of the real date.");
    let sampleRows = 0;
    if (sample.length) {
      if (s.sales.filter((x) => x.date === date).length >= 5) throw new Error("This day already has 5 or more sales, so it is not filled with sample sales.");
      for (const r of sample) {
        const item = s.items.find((i) => i.id === r.itemId);
        if (!item) continue;
        s.sales.push({ date, itemId: r.itemId, qty: r.qty, sample: true });
        item.currentStock = Math.max(0, item.currentStock - r.qty);
        sampleRows++;
      }
    }
    s.businessDate = addDays(date, 1);
    return { closed: date, businessDate: s.businessDate, sampleRows };
  },
  async resetBusinessDate() {
    const s = state();
    const real = todayIST();
    const removed = s.sales.filter((x) => x.sample && x.date >= real);
    for (const r of removed) {
      const item = s.items.find((i) => i.id === r.itemId);
      if (item) item.currentStock += r.qty;
    }
    s.sales = s.sales.filter((x) => !(x.sample && x.date >= real));
    s.businessDate = null;
    return { removedSampleSales: removed.length };
  },
  async createShop() { throw new Error("Demo mode has no accounts. Connect a Supabase project to create a shop."); },
  async deleteMyAccount() { throw new Error("Demo mode has no accounts to delete. Restart the server to reset the demo data."); },
  async getShop(): Promise<Shop> { return raw.shop; },
  async listItems() { return state().items; },
  async listDistributors(): Promise<Distributor[]> { return state().distributors; },
  async listSales(sinceDate) { return state().sales.filter((s) => s.date >= sinceDate); },
  async listDeliveries(sinceDate) { return state().deliveries.filter((d) => d.date >= sinceDate); },
  async listCalendar() { return [...state().calendar].sort((a, b) => a.date.localeCompare(b.date)); },
  async openOrderQty() {
    const out: Record<string, number> = {};
    for (const o of state().orders) if (!o.delivered) for (const l of o.lines) out[l.itemId] = (out[l.itemId] ?? 0) + l.qty;
    return out;
  },
  async openOrders(): Promise<OpenOrder[]> {
    return state().orders
      .filter((o) => !o.delivered && o.lines.length)
      .map((o) => ({ orderId: o.orderId, distributorId: o.distributorId, orderedOn: o.date, lines: o.lines.map((l) => ({ ...l })) }));
  },
  async listOrders(sinceDate): Promise<OrderRecord[]> {
    return state().orders.filter((o) => o.date >= sinceDate).map((o) => ({ orderId: o.orderId, date: o.date, distributorId: o.distributorId, prepSeconds: o.prepSeconds }));
  },
  async addSale(itemId, qty) {
    const s = state();
    const item = s.items.find((i) => i.id === itemId);
    if (!item) throw new Error("Unknown item");
    s.sales.push({ date: bizDate(), itemId, qty });
    item.currentStock = Math.max(0, item.currentStock - qty);
  },
  async addDelivery(itemId, qty) {
    const s = state();
    const item = s.items.find((i) => i.id === itemId);
    if (!item) throw new Error("Unknown item");
    item.currentStock += qty;
    s.deliveries.push({ date: bizDate(), itemId, qty });
    for (const o of s.orders) if (!o.delivered && o.lines.some((l) => l.itemId === itemId)) {
      o.lines = o.lines.filter((l) => l.itemId !== itemId);
      if (!o.lines.length) o.delivered = true;
    }
  },
  async importSales(rows: ImportRow[]): Promise<ImportResult> {
    const s = state();
    const byName = new Map(s.items.map((i) => [i.name.toLowerCase(), i]));
    const errors: ImportResult["errors"] = [];
    let saved = 0;
    for (const r of rows) {
      const item = byName.get(r.itemName.toLowerCase());
      if (!item) { errors.push({ line: r.line, issue: `Item not found: "${r.itemName}"` }); continue; }
      s.sales.push({ date: r.date, itemId: item.id, qty: r.qty });
      saved++;
    }
    return { saved, errors };
  },
  async createOrder(distributorId, lines, prepSeconds = null) {
    const s = state();
    const orderId = `PO-${String(s.nextOrder++).padStart(4, "0")}`;
    s.orders.push({ orderId, distributorId, date: bizDate(), lines: lines.filter((l) => l.qty > 0), delivered: false, prepSeconds });
    return { orderId };
  },

  async saveItem(id, input: ItemInput) {
    const s = state();
    if (!s.distributors.some((d) => d.id === input.distributorId)) throw new Error("Choose a distributor from the list.");
    if (s.items.some((i) => i.id !== id && sameName(i.name, input.name))) throw new Error("An item with this name already exists.");
    if (id) {
      const it = s.items.find((i) => i.id === id);
      if (!it) throw new Error("Item not found.");
      Object.assign(it, { name: input.name, category: input.category, pack: input.pack, price: input.price, distributorId: input.distributorId, leadTimeDays: input.leadTimeDays, minSafetyStock: input.minSafetyStock, orderCoverDays: input.orderCoverDays });
      return { id };
    }
    const newId = `I${s.nextItem++}`;
    s.items.push({ id: newId, name: input.name, category: input.category, pack: input.pack, price: input.price, distributorId: input.distributorId, leadTimeDays: input.leadTimeDays, minSafetyStock: input.minSafetyStock, orderCoverDays: input.orderCoverDays, currentStock: input.openingStock });
    return { id: newId };
  },
  async archiveItem(id) {
    const s = state();
    s.items = s.items.filter((i) => i.id !== id);
  },
  async saveDistributor(id, input: DistributorInput) {
    const s = state();
    if (s.distributors.some((d) => d.id !== id && sameName(d.name, input.name))) throw new Error("A distributor with this name already exists.");
    if (id) {
      const d = s.distributors.find((x) => x.id === id);
      if (!d) throw new Error("Distributor not found.");
      Object.assign(d, input);
      return { id };
    }
    const newId = `D${s.nextDistributor++}`;
    s.distributors.push({ id: newId, ...input });
    return { id: newId };
  },
  async listHelpers() { return state().helpers.map((h) => ({ ...h })); },
  async addHelper(email, name) {
    const s = state();
    if (s.helpers.some((h) => h.email === email)) throw new Error("This email is already a helper.");
    s.helpers.push({ id: `U${s.nextHelper++}`, name: name || email.split("@")[0], email, status: "Invited" });
  },
  async removeHelper(id) {
    const s = state();
    s.helpers = s.helpers.filter((h) => h.id !== id);
  },

  async saveCalendarDay(day) {
    const s = state();
    const i = s.calendar.findIndex((c) => c.date === day.date);
    if (i >= 0) s.calendar[i] = day; else s.calendar.push(day);
  },
  async deleteCalendarDay(date) {
    const s = state();
    s.calendar = s.calendar.filter((c) => c.date !== date);
  },

  // The nightly job needs Supabase, so the demo has no saved forecasts. The scorecard falls back to a back-test.
  async listSavedForecasts() { return []; },

  async listAiForecasts(sinceDate) { return state().aiRows.filter((r) => r.runDate >= sinceDate); },
  async saveAiForecasts(rows) {
    const s = state();
    const key = (r: AiForecastRow) => `${r.runDate}|${r.itemId}|${r.provider}`;
    const fresh = new Set(rows.map(key));
    s.aiRows = [...s.aiRows.filter((r) => !fresh.has(key(r))), ...rows];
  },
};
