// Live mode: data in Supabase. Row-level security limits every query to the signed-in user's shop.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { todayIST } from "@/lib/dates";
import type { ImportResult, ImportRow, Item, Store } from "./types";

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* called from a server component */ }
      },
    },
  });
}

async function me() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const { data: user, error } = await sb.from("users").select("id, shop_id, role").eq("id", auth.user.id).single();
  if (error || !user) throw new Error("This Google account is not linked to a shop yet");
  return { sb, user };
}

export const supabaseStore: Store = {
  mode: "live",
  async getShop() {
    const { sb, user } = await me();
    const { data } = await sb.from("shops").select("id, name, locality").eq("id", user.shop_id).single();
    return data!;
  },
  async listItems() {
    const { sb } = await me();
    const { data } = await sb.from("items").select("*").eq("is_active", true).order("name");
    return (data ?? []).map((r): Item => ({
      id: r.id, name: r.name, category: r.category, pack: r.pack, price: Number(r.price), distributorId: r.distributor_id,
      leadTimeDays: r.lead_time_days, minSafetyStock: r.min_safety_stock, orderCoverDays: r.order_cover_days, currentStock: r.current_stock,
    }));
  },
  async listDistributors() {
    const { sb } = await me();
    const { data } = await sb.from("distributors").select("*").order("name");
    return (data ?? []).map((r) => ({ id: r.id, name: r.name, supplies: r.supplies, salesman: r.salesman, whatsapp: r.whatsapp, visitDay: r.visit_day }));
  },
  async listSales(sinceDate) {
    const { sb } = await me();
    const out: { date: string; itemId: string; qty: number }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await sb.from("sales").select("sale_date, item_id, quantity").gte("sale_date", sinceDate).range(from, from + 999);
      if (!data?.length) break;
      out.push(...data.map((r) => ({ date: r.sale_date, itemId: r.item_id, qty: r.quantity })));
      if (data.length < 1000) break;
    }
    return out;
  },
  async listCalendar() {
    const { sb } = await me();
    const { data } = await sb.from("conditions_calendar").select("day, name, uplift_pct");
    return (data ?? []).map((r) => ({ date: r.day, name: r.name, upliftPct: r.uplift_pct }));
  },
  async openOrderQty() {
    const { sb } = await me();
    const { data } = await sb.from("order_lines").select("item_id, quantity, delivered").eq("delivered", false);
    const out: Record<string, number> = {};
    for (const r of data ?? []) out[r.item_id] = (out[r.item_id] ?? 0) + r.quantity;
    return out;
  },
  async addSale(itemId, qty, method) {
    const { sb, user } = await me();
    const { error } = await sb.from("sales").insert({ shop_id: user.shop_id, item_id: itemId, sale_date: todayIST(), quantity: qty, entry_method: method, logged_by: user.id });
    if (error) throw new Error(error.message);
  },
  async addDelivery(itemId, qty) {
    const { sb, user } = await me();
    const { error } = await sb.from("deliveries").insert({ shop_id: user.shop_id, item_id: itemId, quantity: qty });
    if (error) throw new Error(error.message);
  },
  async importSales(rows: ImportRow[]): Promise<ImportResult> {
    const { sb, user } = await me();
    const items = await this.listItems();
    const byName = new Map(items.map((i) => [i.name.toLowerCase(), i]));
    const errors: ImportResult["errors"] = [];
    const good = [];
    for (const r of rows) {
      const it = byName.get(r.itemName.toLowerCase());
      if (!it) { errors.push({ line: r.line, issue: `Item not found: "${r.itemName}"` }); continue; }
      good.push({ shop_id: user.shop_id, item_id: it.id, sale_date: r.date, quantity: r.qty, entry_method: "CSV upload", logged_by: user.id });
    }
    for (let i = 0; i < good.length; i += 500) {
      const { error } = await sb.from("sales").insert(good.slice(i, i + 500));
      if (error) throw new Error(error.message);
    }
    return { saved: good.length, errors };
  },
  async createOrder(distributorId, lines) {
    const { sb, user } = await me();
    const { data, error } = await sb.from("orders").insert({ shop_id: user.shop_id, distributor_id: distributorId, whatsapp_payload: { lines } }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Order not saved");
    const { error: e2 } = await sb.from("order_lines").insert(lines.filter((l) => l.qty > 0).map((l) => ({ order_id: data.id, item_id: l.itemId, quantity: l.qty })));
    if (e2) throw new Error(e2.message);
    return { orderId: data.id };
  },
};
