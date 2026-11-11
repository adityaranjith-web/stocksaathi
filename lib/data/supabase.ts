// Live mode: data in Supabase. Row-level security limits every query to the signed-in user's shop,
// and the owner-only rules (BR7) are enforced by the database, not only by the screens.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { todayIST } from "@/lib/dates";
import type { CalendarDay } from "@/lib/forecast/desk";
import type { AiForecastRow, DistributorInput, Helper, ImportResult, ImportRow, Item, ItemInput, Me, OpenOrder, OrderRecord, Store } from "./types";

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

const USER_COLUMNS = "id, shop_id, role, name, is_team";

async function me() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  let { data: user } = await sb.from("users").select(USER_COLUMNS).eq("id", auth.user.id).maybeSingle();
  if (!user) {
    // A helper who signs in for the first time: the owner's invite (by Google email) links them to the shop.
    const { data: claimed } = await sb.rpc("claim_invite");
    if (claimed) ({ data: user } = await sb.from("users").select(USER_COLUMNS).eq("id", auth.user.id).maybeSingle());
  }
  if (!user) throw new Error("This Google account is not linked to a shop yet");
  return { sb, user };
}

/** Turns a database error into a sentence the owner can read. */
function friendly(error: { code?: string; message: string }, fallback: string, duplicate = "That name is already in use."): Error {
  if (error.code === "23505") return new Error(duplicate);
  if (error.code === "42501") return new Error("Only the owner can do this.");
  return new Error(fallback || error.message);
}

export const supabaseStore: Store = {
  mode: "live",
  async getMe(): Promise<Me> {
    const { user } = await me();
    return { name: user.name, role: user.role, isTeam: Boolean(user.is_team) };
  },
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
    return (data ?? []).map((r) => ({ id: r.id, name: r.name, supplies: r.supplies ?? "", salesman: r.salesman ?? "", whatsapp: r.whatsapp ?? "", visitDay: r.visit_day ?? "" }));
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
  async listDeliveries(sinceDate) {
    const { sb } = await me();
    const { data } = await sb.from("deliveries").select("received_on, item_id, quantity").gte("received_on", sinceDate);
    return (data ?? []).map((r) => ({ date: r.received_on, itemId: r.item_id, qty: r.quantity }));
  },
  async listCalendar() {
    const { sb } = await me();
    const { data } = await sb.from("conditions_calendar").select("day, name, uplift_pct").order("day");
    return (data ?? []).map((r) => ({ date: r.day, name: r.name, upliftPct: r.uplift_pct }));
  },
  async openOrderQty() {
    const { sb } = await me();
    const { data } = await sb.from("order_lines").select("item_id, quantity, delivered").eq("delivered", false);
    const out: Record<string, number> = {};
    for (const r of data ?? []) out[r.item_id] = (out[r.item_id] ?? 0) + r.quantity;
    return out;
  },
  async openOrders(): Promise<OpenOrder[]> {
    const { sb } = await me();
    const { data } = await sb.from("orders").select("id, distributor_id, order_date, order_lines(item_id, quantity, delivered)").eq("status", "Sent").order("order_date");
    return (data ?? [])
      .map((o) => ({
        orderId: o.id, distributorId: o.distributor_id, orderedOn: o.order_date,
        lines: (o.order_lines ?? []).filter((l: { delivered: boolean }) => !l.delivered).map((l: { item_id: string; quantity: number }) => ({ itemId: l.item_id, qty: l.quantity })),
      }))
      .filter((o) => o.lines.length);
  },
  async listOrders(sinceDate): Promise<OrderRecord[]> {
    const { sb } = await me();
    const { data } = await sb.from("orders").select("id, order_date, distributor_id, prep_seconds").gte("order_date", sinceDate);
    return (data ?? []).map((o) => ({ orderId: o.id, date: o.order_date, distributorId: o.distributor_id, prepSeconds: o.prep_seconds }));
  },
  async addSale(itemId, qty, method) {
    const { sb, user } = await me();
    const { error } = await sb.from("sales").insert({ shop_id: user.shop_id, item_id: itemId, sale_date: todayIST(), quantity: qty, entry_method: method, logged_by: user.id });
    if (error) throw new Error(error.message);
  },
  async addDelivery(itemId, qty) {
    const { sb, user } = await me();
    const { error } = await sb.from("deliveries").insert({ shop_id: user.shop_id, item_id: itemId, quantity: qty });
    if (error) throw friendly(error, error.message);
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
  async createOrder(distributorId, lines, prepSeconds = null) {
    const { sb, user } = await me();
    const { data, error } = await sb.from("orders").insert({ shop_id: user.shop_id, distributor_id: distributorId, whatsapp_payload: { lines }, prep_seconds: prepSeconds }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Order not saved");
    const { error: e2 } = await sb.from("order_lines").insert(lines.filter((l) => l.qty > 0).map((l) => ({ order_id: data.id, item_id: l.itemId, quantity: l.qty })));
    if (e2) throw new Error(e2.message);
    return { orderId: data.id };
  },

  async saveItem(id, input: ItemInput) {
    const { sb, user } = await me();
    const row = {
      name: input.name, category: input.category, pack: input.pack, price: input.price, distributor_id: input.distributorId,
      lead_time_days: input.leadTimeDays, min_safety_stock: input.minSafetyStock, order_cover_days: input.orderCoverDays,
    };
    const q = id
      ? sb.from("items").update(row).eq("id", id).select("id").single()
      : sb.from("items").insert({ ...row, shop_id: user.shop_id, current_stock: input.openingStock }).select("id").single();
    const { data, error } = await q;
    if (error || !data) throw friendly(error ?? { message: "" }, "The item was not saved. Only the owner can change items.", "An item with this name already exists.");
    return { id: data.id };
  },
  async archiveItem(id) {
    const { sb } = await me();
    const { error } = await sb.from("items").update({ is_active: false }).eq("id", id);
    if (error) throw friendly(error, "The item was not removed.");
  },
  async saveDistributor(id, input: DistributorInput) {
    const { sb, user } = await me();
    const row = { name: input.name, supplies: input.supplies, salesman: input.salesman, whatsapp: input.whatsapp, visit_day: input.visitDay };
    const q = id
      ? sb.from("distributors").update(row).eq("id", id).select("id").single()
      : sb.from("distributors").insert({ ...row, shop_id: user.shop_id }).select("id").single();
    const { data, error } = await q;
    if (error || !data) throw friendly(error ?? { message: "" }, "The distributor was not saved. Only the owner can change distributors.", "A distributor with this name already exists.");
    return { id: data.id };
  },
  async listHelpers(): Promise<Helper[]> {
    const { sb } = await me();
    const [users, invites] = await Promise.all([
      sb.from("users").select("id, name, email").eq("role", "helper"),
      sb.from("helper_invites").select("id, name, email"),
    ]);
    return [
      ...(users.data ?? []).map((u): Helper => ({ id: u.id, name: u.name, email: u.email ?? "", status: "Active" })),
      ...(invites.data ?? []).map((i): Helper => ({ id: i.id, name: i.name ?? "", email: i.email, status: "Invited" })),
    ];
  },
  async addHelper(email, name) {
    const { sb, user } = await me();
    const { error } = await sb.from("helper_invites").insert({ shop_id: user.shop_id, email, name });
    if (error) throw friendly(error, "The helper was not added. Only the owner can add helpers.", "This email is already added as a helper.");
  },
  async removeHelper(id) {
    const { sb } = await me();
    const a = await sb.from("users").delete().eq("id", id).eq("role", "helper");
    const b = await sb.from("helper_invites").delete().eq("id", id);
    if (a.error && b.error) throw friendly(a.error, "The helper was not removed.");
  },

  async saveCalendarDay(day: CalendarDay) {
    const { sb } = await me();
    const { error } = await sb.from("conditions_calendar").upsert({ day: day.date, name: day.name, uplift_pct: day.upliftPct });
    if (error) throw friendly(error, "Only the product team can change the festival calendar.");
  },
  async deleteCalendarDay(date) {
    const { sb } = await me();
    const { error } = await sb.from("conditions_calendar").delete().eq("day", date);
    if (error) throw friendly(error, "Only the product team can change the festival calendar.");
  },

  async listAiForecasts(sinceDate): Promise<AiForecastRow[]> {
    const { sb } = await me();
    const { data } = await sb.from("ai_forecasts").select("*").gte("run_date", sinceDate);
    return (data ?? []).map((r) => ({
      runDate: r.run_date, itemId: r.item_id, provider: r.provider, aiUnitsPerDay: Number(r.ai_units_per_day),
      blendUnitsPerDay: Number(r.blend_units_per_day), horizonDays: r.horizon_days,
      low: r.low === null ? null : Number(r.low), high: r.high === null ? null : Number(r.high),
    }));
  },
  async saveAiForecasts(rows) {
    const { sb, user } = await me();
    if (!rows.length) return;
    const { error } = await sb.from("ai_forecasts").upsert(rows.map((r) => ({
      shop_id: user.shop_id, item_id: r.itemId, run_date: r.runDate, provider: r.provider, ai_units_per_day: r.aiUnitsPerDay,
      blend_units_per_day: r.blendUnitsPerDay, horizon_days: r.horizonDays, low: r.low, high: r.high,
    })));
    if (error) throw friendly(error, "AI forecasts were not saved.");
  },
};
