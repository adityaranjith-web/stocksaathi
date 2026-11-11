// Demo mode: the Session 6 sample data, held in memory on the server.
// Dates are shifted so the last day of sample data is always yesterday.
// Changes (sales, deliveries, orders) last until the server restarts.
import raw from "./demo-data.json";
import { addDays } from "@/lib/forecast/desk";
import { asOfDay, daysBetween, todayIST } from "@/lib/dates";
import type { Distributor, ImportResult, ImportRow, Item, Sale, Shop, Store } from "./types";

interface DemoState {
  items: Item[];
  sales: Sale[];
  openOrders: { orderId: string; distributorId: string; lines: { itemId: string; qty: number }[]; delivered: boolean }[];
  nextOrder: number;
}

const g = globalThis as unknown as { __stocksaathiDemo?: DemoState };

function load(): DemoState {
  const shift = daysBetween(raw.lastDataDay, asOfDay());
  return {
    items: raw.items.map((i) => ({ ...i })),
    sales: raw.sales.map(([date, itemId, qty]) => ({ date: addDays(date as string, shift), itemId: itemId as string, qty: qty as number })),
    openOrders: [],
    nextOrder: 9,
  };
}
function state(): DemoState {
  if (!g.__stocksaathiDemo) g.__stocksaathiDemo = load();
  return g.__stocksaathiDemo;
}

export const demoStore: Store = {
  mode: "demo",
  async getShop(): Promise<Shop> { return raw.shop; },
  async listItems() { return state().items; },
  async listDistributors(): Promise<Distributor[]> { return raw.distributors; },
  async listSales(sinceDate) { return state().sales.filter((s) => s.date >= sinceDate); },
  async listCalendar() { return raw.calendar; },
  async openOrderQty() {
    const out: Record<string, number> = {};
    for (const o of state().openOrders) if (!o.delivered) for (const l of o.lines) out[l.itemId] = (out[l.itemId] ?? 0) + l.qty;
    return out;
  },
  async addSale(itemId, qty) {
    const s = state();
    const item = s.items.find((i) => i.id === itemId);
    if (!item) throw new Error("Unknown item");
    s.sales.push({ date: todayIST(), itemId, qty });
    item.currentStock = Math.max(0, item.currentStock - qty);
  },
  async addDelivery(itemId, qty) {
    const s = state();
    const item = s.items.find((i) => i.id === itemId);
    if (!item) throw new Error("Unknown item");
    item.currentStock += qty;
    for (const o of s.openOrders) if (!o.delivered && o.lines.some((l) => l.itemId === itemId)) {
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
  async createOrder(distributorId, lines) {
    const s = state();
    const orderId = `PO-${String(s.nextOrder++).padStart(4, "0")}`;
    s.openOrders.push({ orderId, distributorId, lines: lines.filter((l) => l.qty > 0), delivered: false });
    return { orderId };
  },
};
