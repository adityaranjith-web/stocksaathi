// Connects the nightly job to Supabase with the admin client. SERVER ONLY.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NightlyDb, NightlyRows, ShopData } from "@/lib/nightly";
import { rowToItem } from "@/lib/data/rows";
import { todayIST } from "@/lib/dates";
import { effectiveBusinessDate } from "@/lib/business-day";

if (typeof window !== "undefined") throw new Error("The nightly job runs on the server only.");

const CHUNK = 500;

export function supabaseNightlyDb(sb: SupabaseClient): NightlyDb {
  async function upsert(table: string, rows: object[], onConflict: string) {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await sb.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }

  return {
    async listShopIds() {
      const { data, error } = await sb.from("shops").select("id").order("id");
      if (error) throw new Error(`shops: ${error.message}`);
      return (data ?? []).map((s) => s.id as string);
    },

    async loadShop(shopId, salesSince): Promise<ShopData> {
      // The shop's own "today" and whether it is the demo shop (migration 0008).
      const { data: shop, error: e0 } = await sb.from("shops").select("business_date, is_sample_shop").eq("id", shopId).single();
      if (e0) throw new Error(`shops: ${e0.message}`);
      const { data: items, error: e1 } = await sb.from("items").select("id, distributor_id, name, category, pack, price, current_stock, lead_time_days, min_safety_stock, order_cover_days, est_daily_sales").eq("shop_id", shopId).eq("is_active", true);
      if (e1) throw new Error(`items: ${e1.message}`);

      const sales: ShopData["sales"] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from("sales").select("sale_date, item_id, quantity").eq("shop_id", shopId).gte("sale_date", salesSince).order("id").range(from, from + 999);
        if (error) throw new Error(`sales: ${error.message}`);
        if (!data?.length) break;
        sales.push(...data.map((r) => ({ date: r.sale_date as string, itemId: r.item_id as string, qty: r.quantity as number })));
        if (data.length < 1000) break;
      }

      const { data: cal, error: e3 } = await sb.from("conditions_calendar").select("day, name, uplift_pct");
      if (e3) throw new Error(`conditions_calendar: ${e3.message}`);

      // Units already ordered and not yet delivered, for this shop's items only.
      const { data: lines, error: e4 } = await sb.from("order_lines").select("item_id, quantity, orders!inner(shop_id)").eq("delivered", false).eq("orders.shop_id", shopId);
      if (e4) throw new Error(`order_lines: ${e4.message}`);
      const onOrder: Record<string, number> = {};
      for (const l of lines ?? []) onOrder[l.item_id as string] = (onOrder[l.item_id as string] ?? 0) + (l.quantity as number);

      return {
        items: (items ?? []).map((r) => rowToItem(r)),
        sales,
        calendar: (cal ?? []).map((c) => ({ date: c.day as string, name: c.name as string, upliftPct: c.uplift_pct as number })),
        onOrder,
        businessDate: effectiveBusinessDate(shop?.business_date as string | null, todayIST()),
        sampleShop: Boolean(shop?.is_sample_shop),
      };
    },

    async saveRows(rows: NightlyRows) {
      // One night, one item, one model = one row. Saving again the same night replaces it.
      await upsert("model_forecasts", rows.modelForecasts, "item_id,run_date,model");
      await upsert("model_scores", rows.modelScores, "item_id,run_date,model");
      await upsert("final_forecasts", rows.finalForecasts, "item_id,run_date");
    },

    async saveSampleSales(shopId, rows) {
      // Labelled sample sales for the demo shop only (the caller checks is_sample_shop). The database's stock rule
      // lowers stock for them like any sale. Never any other shop: the shop id comes from the job, not from a person.
      const { data: shop, error: e0 } = await sb.from("shops").select("is_sample_shop").eq("id", shopId).single();
      if (e0) throw new Error(`shops: ${e0.message}`);
      if (!shop?.is_sample_shop) throw new Error("Sample sales are only for the demo shop.");
      const all = rows.map((r) => ({ shop_id: shopId, item_id: r.itemId, sale_date: r.date, quantity: r.qty, entry_method: "Quick tap", is_sample: true }));
      for (let i = 0; i < all.length; i += CHUNK) {
        const { error } = await sb.from("sales").insert(all.slice(i, i + CHUNK));
        if (error) throw new Error(`sales: ${error.message}`);
      }
    },

    async saveAiRows(shopId, rows) {
      // One day, one item, one AI provider = one row. Saving again the same day replaces it.
      await upsert("ai_forecasts", rows.map((r) => ({
        shop_id: shopId, item_id: r.itemId, run_date: r.runDate, provider: r.provider, ai_units_per_day: r.aiUnitsPerDay,
        blend_units_per_day: r.blendUnitsPerDay, horizon_days: r.horizonDays, low: r.low, high: r.high,
      })), "item_id,run_date,provider");
    },
  };
}
