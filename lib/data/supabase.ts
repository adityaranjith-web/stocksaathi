// Live mode: data in Supabase. Row-level security limits every query to the signed-in user's shop,
// and the owner-only rules (BR7) are enforced by the database, not only by the screens.
//
// Speed (migration 0006): a page needs the sign-in check and ONE call, shop_snapshot(), which returns the shop, items,
// distributors, daily sales totals, festival calendar and what is on order together. Both are made once per page request
// (React cache) and shared by every store method, and they run at the same time. Sales come back as daily totals per
// item (not raw rows), which the Forecast Desk adds up anyway, so every forecast and order quantity is identical.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { asOfDay, todayIST } from "@/lib/dates";
import { addDays, type CalendarDay } from "@/lib/forecast/desk";
import { timedFetch } from "@/lib/perf";
import { rowToItem } from "./rows";
import { AccessError, SetupError, setupMessage } from "./errors";
import type { AiForecastRow, Distributor, DistributorInput, Helper, ImportResult, ImportRow, Item, ItemInput, Me, OpenOrder, OrderRecord, SavedForecast, Sale, Store } from "./types";

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { fetch: timedFetch }, // counts and times every call to Supabase (lib/perf.ts)
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* called from a server component */ }
      },
    },
  });
}

/** Days of sales in a snapshot: the Forecast Desk looks at 56 days. */
export const SNAPSHOT_DAYS = 56;
const snapshotSince = () => addDays(asOfDay(), -(SNAPSHOT_DAYS - 1));

const USER_COLUMNS = "id, shop_id, role, name, is_team";
type UserRow = { id: string; shop_id: string; role: "owner" | "helper"; name: string; is_team: boolean | null };

/** What shop_snapshot() returns (see supabase/migrations/0006_performance.sql). */
export interface Snapshot {
  me: UserRow | null;
  shop: { id: string; name: string; locality: string | null } | null;
  items: { id: string; distributor_id: string; name: string; category: string | null; pack: string | null; price: number | string; current_stock: number; lead_time_days: number; min_safety_stock: number; order_cover_days: number }[];
  distributors: { id: string; name: string; supplies: string | null; salesman: string | null; whatsapp: string | null; visit_day: string | null }[];
  sales: [string, string, number][]; // [item_id, date, quantity]: one entry per item per day
  calendar: { day: string; name: string; uplift_pct: number }[];
  on_order: Record<string, number>;
  open_orders: { id: string; distributor_id: string; order_date: string; lines: { item_id: string; quantity: number }[] }[];
}

// ---------- once per page request ----------
const client = cache(() => supabaseServer());

/** The id inside a sign-in token (its "sub"). Reads the token only; it does not check the signature. */
function tokenSubject(token: string): string | null {
  try {
    const sub = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub;
    return typeof sub === "string" ? sub : null;
  } catch { return null; }
}

/**
 * Who is signed in, read from the sign-in cookie. NO network call.
 * Why this is safe: the middleware has already checked this same cookie with Supabase's auth server on this very request
 * (auth.getUser) and sent signed-out visitors to the sign-in page. Nothing here grants access: every query is sent with
 * this cookie's token, and the database checks the token's signature and applies row-level security. A forged cookie
 * gets no data. It only decides whether to show "signed out" or look the person up. (The auth server round trip used to
 * be made again here; the client also made the data calls wait for it, so every page paid for it twice.)
 */
const authUser = cache(async () => {
  const sb = await client();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  const id = token ? tokenSubject(token) : null;
  return id ? { id } : null;
});

/** A token the database does not accept (expired, or not signed by Supabase) means "signed out", not a set-up fault. */
const isBadToken = (e: { code?: string; message: string }) => e.code === "PGRST301" || /JWT/i.test(e.message);

async function callSnapshot(sb: Awaited<ReturnType<typeof supabaseServer>>): Promise<Snapshot> {
  const { data, error } = await sb.rpc("shop_snapshot", { p_since: snapshotSince() });
  if (error) throw isBadToken(error) ? new AccessError("signed-out") : new SetupError(setupMessage(error.message));
  return data as Snapshot;
}

/**
 * Everything a page needs, in one call. The sign-in check and the snapshot do not depend on each other, so they run at
 * the same time: a page costs one round trip to the database, not two. Throws AccessError for "signed out" and
 * "no shop yet", and SetupError when the database itself is wrong (a migration was not run).
 */
const snap = cache(async (): Promise<Snapshot> => {
  const sb = await client();
  const [user, first] = await Promise.all([authUser(), callSnapshot(sb).catch((e: Error) => e)]);
  if (!user) throw new AccessError("signed-out");
  if (first instanceof Error) throw first;
  if (first.me) return first;
  // Signed in with no shop: a helper's first sign-in is linked to the shop by the owner's invite.
  const { data: claimed, error } = await sb.rpc("claim_invite");
  if (error) throw new SetupError(setupMessage(error.message));
  if (!claimed) throw new AccessError("no-shop");
  const again = await callSnapshot(sb);
  if (!again.me) throw new AccessError("no-shop");
  return again;
});

/**
 * The signed-in person and their user row, without the whole snapshot. For actions that write (a sale, a delivery),
 * which must stay light. Two calls, once per request.
 */
const lightMe = cache(async () => {
  const sb = await client();
  const user = await authUser();
  if (!user) throw new AccessError("signed-out");
  const find = () => sb.from("users").select(USER_COLUMNS).eq("id", user.id).maybeSingle();
  let { data: row, error } = await find();
  if (error) throw isBadToken(error) ? new AccessError("signed-out") : new SetupError(setupMessage(error.message));
  if (!row) {
    const { data: claimed, error: e2 } = await sb.rpc("claim_invite");
    if (e2) throw new SetupError(setupMessage(e2.message));
    if (claimed) {
      ({ data: row, error } = await find());
      if (error) throw new SetupError(setupMessage(error.message));
    }
  }
  if (!row) throw new AccessError("no-shop");
  return { sb, user: row as UserRow };
});

/** Turns a database error into a sentence the owner can read. */
function friendly(error: { code?: string; message: string }, fallback: string, duplicate = "That name is already in use."): Error {
  if (error.code === "23505") return new Error(duplicate);
  if (error.code === "42501") return new Error("Only the owner can do this.");
  return new Error(fallback || error.message);
}

export const supabaseStore: Store = {
  mode: "live",
  async getMe(): Promise<Me> {
    const { me } = await snap();
    return { name: me!.name, role: me!.role, isTeam: Boolean(me!.is_team) };
  },
  async createShop(name, locality, consent) {
    const sb = await client();
    if (!(await authUser())) throw new AccessError("signed-out");
    const { data, error } = await sb.rpc("create_shop", { p_name: name, p_locality: locality, p_consent: consent });
    if (error) throw new Error(/create_shop/.test(error.message) && /not exist|schema cache|find the function/i.test(error.message) ? setupMessage(error.message) : error.message);
    return { shopId: data as string };
  },
  async deleteMyAccount(confirmName) {
    const { sb } = await lightMe();
    const { error } = await sb.rpc("delete_my_account", { p_confirm: confirmName });
    if (error) throw new Error(error.message);
    await sb.auth.signOut(); // the sign-in record is already gone; this clears the cookies in this browser
  },

  // ----- reads that come from the snapshot (no extra calls) -----
  async getShop() {
    const { shop } = await snap();
    return { id: shop!.id, name: shop!.name, locality: shop!.locality ?? "" };
  },
  async listItems() {
    return (await snap()).items.map((r): Item => rowToItem(r));
  },
  async listDistributors(): Promise<Distributor[]> {
    return (await snap()).distributors.map((r) => ({ id: r.id, name: r.name, supplies: r.supplies ?? "", salesman: r.salesman ?? "", whatsapp: r.whatsapp ?? "", visitDay: r.visit_day ?? "" }));
  },
  /** Daily totals per item (one entry per item per day), not raw rows. From the snapshot when it covers the dates. */
  async listSales(sinceDate): Promise<Sale[]> {
    let totals: [string, string, number][];
    if (sinceDate >= snapshotSince()) {
      totals = (await snap()).sales.filter((t) => t[1] >= sinceDate);
    } else {
      await snap(); // who is asking, and are they in a shop
      const sb = await client();
      const { data, error } = await sb.rpc("daily_sales", { p_since: sinceDate });
      if (error) throw new SetupError(setupMessage(error.message));
      totals = data as [string, string, number][];
    }
    return totals.map(([itemId, date, qty]) => ({ date, itemId, qty }));
  },
  async listCalendar() {
    return (await snap()).calendar.map((r) => ({ date: r.day, name: r.name, upliftPct: r.uplift_pct }));
  },
  async openOrderQty() {
    return { ...(await snap()).on_order };
  },
  async openOrders(): Promise<OpenOrder[]> {
    return (await snap()).open_orders.map((o) => ({
      orderId: o.id, distributorId: o.distributor_id, orderedOn: o.order_date,
      lines: o.lines.map((l) => ({ itemId: l.item_id, qty: l.quantity })),
    }));
  },

  // ----- other reads (row-level security limits them to the signed-in person's shop) -----
  async listDeliveries(sinceDate) {
    const sb = await client();
    const { data } = await sb.from("deliveries").select("received_on, item_id, quantity").gte("received_on", sinceDate);
    return (data ?? []).map((r) => ({ date: r.received_on, itemId: r.item_id, qty: r.quantity }));
  },
  async listOrders(sinceDate): Promise<OrderRecord[]> {
    const sb = await client();
    const { data } = await sb.from("orders").select("id, order_date, distributor_id, prep_seconds").gte("order_date", sinceDate);
    return (data ?? []).map((o) => ({ orderId: o.id, date: o.order_date, distributorId: o.distributor_id, prepSeconds: o.prep_seconds }));
  },

  // ----- writes -----
  async addSale(itemId, qty, method) {
    const { sb, user } = await lightMe();
    const { error } = await sb.from("sales").insert({ shop_id: user.shop_id, item_id: itemId, sale_date: todayIST(), quantity: qty, entry_method: method, logged_by: user.id });
    if (error) throw new Error(error.message);
  },
  async addDelivery(itemId, qty) {
    const { sb, user } = await lightMe();
    const { error } = await sb.from("deliveries").insert({ shop_id: user.shop_id, item_id: itemId, quantity: qty });
    if (error) throw friendly(error, error.message);
  },
  async importSales(rows: ImportRow[]): Promise<ImportResult> {
    const { sb, user } = await lightMe();
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
    const { sb, user } = await lightMe();
    const { data, error } = await sb.from("orders").insert({ shop_id: user.shop_id, distributor_id: distributorId, whatsapp_payload: { lines }, prep_seconds: prepSeconds }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Order not saved");
    const { error: e2 } = await sb.from("order_lines").insert(lines.filter((l) => l.qty > 0).map((l) => ({ order_id: data.id, item_id: l.itemId, quantity: l.qty })));
    if (e2) throw new Error(e2.message);
    return { orderId: data.id };
  },

  async saveItem(id, input: ItemInput) {
    const { sb, user } = await lightMe();
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
    const sb = await client();
    const { error } = await sb.from("items").update({ is_active: false }).eq("id", id);
    if (error) throw friendly(error, "The item was not removed.");
  },
  async saveDistributor(id, input: DistributorInput) {
    const { sb, user } = await lightMe();
    const row = { name: input.name, supplies: input.supplies, salesman: input.salesman, whatsapp: input.whatsapp, visit_day: input.visitDay };
    const q = id
      ? sb.from("distributors").update(row).eq("id", id).select("id").single()
      : sb.from("distributors").insert({ ...row, shop_id: user.shop_id }).select("id").single();
    const { data, error } = await q;
    if (error || !data) throw friendly(error ?? { message: "" }, "The distributor was not saved. Only the owner can change distributors.", "A distributor with this name already exists.");
    return { id: data.id };
  },
  async listHelpers(): Promise<Helper[]> {
    const sb = await client();
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
    const { sb, user } = await lightMe();
    const { error } = await sb.from("helper_invites").insert({ shop_id: user.shop_id, email, name });
    if (error) throw friendly(error, "The helper was not added. Only the owner can add helpers.", "This email is already added as a helper.");
  },
  async removeHelper(id) {
    const sb = await client();
    const a = await sb.from("users").delete().eq("id", id).eq("role", "helper");
    const b = await sb.from("helper_invites").delete().eq("id", id);
    if (a.error && b.error) throw friendly(a.error, "The helper was not removed.");
  },

  async saveCalendarDay(day: CalendarDay) {
    const sb = await client();
    const { error } = await sb.from("conditions_calendar").upsert({ day: day.date, name: day.name, uplift_pct: day.upliftPct });
    if (error) throw friendly(error, "Only the product team can change the festival calendar.");
  },
  async deleteCalendarDay(date) {
    const sb = await client();
    const { error } = await sb.from("conditions_calendar").delete().eq("day", date);
    if (error) throw friendly(error, "Only the product team can change the festival calendar.");
  },

  async listSavedForecasts(sinceDate): Promise<SavedForecast[]> {
    const sb = await client();
    // Row-level security limits both tables to this shop. The plain 28-day average is model M2.
    const page = async <T,>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> => {
      const out: T[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await q(from, from + 999);
        if (!data?.length) break;
        out.push(...data);
        if (data.length < 1000) break;
      }
      return out;
    };
    const [finals, simples] = await Promise.all([
      page((a, b) => sb.from("final_forecasts").select("item_id, run_date, units_per_day, horizon_days").gte("run_date", sinceDate).order("run_date").order("item_id").range(a, b)),
      page((a, b) => sb.from("model_forecasts").select("item_id, run_date, units_per_day").eq("model", "M2").gte("run_date", sinceDate).order("run_date").order("item_id").range(a, b)),
    ]);
    const m2 = new Map(simples.map((r) => [`${r.item_id}|${r.run_date}`, Number(r.units_per_day)]));
    return finals
      .filter((r) => typeof r.horizon_days === "number" && r.horizon_days > 0)
      .map((r) => ({
        runDate: r.run_date, itemId: r.item_id, horizonDays: r.horizon_days as number,
        blendUnitsPerDay: Number(r.units_per_day), simpleUnitsPerDay: m2.get(`${r.item_id}|${r.run_date}`) ?? null,
      }));
  },

  async listAiForecasts(sinceDate): Promise<AiForecastRow[]> {
    const sb = await client();
    const { data } = await sb.from("ai_forecasts").select("run_date, item_id, provider, ai_units_per_day, blend_units_per_day, horizon_days, low, high").gte("run_date", sinceDate);
    return (data ?? []).map((r) => ({
      runDate: r.run_date, itemId: r.item_id, provider: r.provider, aiUnitsPerDay: Number(r.ai_units_per_day),
      blendUnitsPerDay: Number(r.blend_units_per_day), horizonDays: r.horizon_days,
      low: r.low === null ? null : Number(r.low), high: r.high === null ? null : Number(r.high),
    }));
  },
  async saveAiForecasts(rows) {
    const { sb, user } = await lightMe();
    if (!rows.length) return;
    const { error } = await sb.from("ai_forecasts").upsert(rows.map((r) => ({
      shop_id: user.shop_id, item_id: r.itemId, run_date: r.runDate, provider: r.provider, ai_units_per_day: r.aiUnitsPerDay,
      blend_units_per_day: r.blendUnitsPerDay, horizon_days: r.horizonDays, low: r.low, high: r.high,
    })));
    if (error) throw friendly(error, "AI forecasts were not saved.");
  },
};
