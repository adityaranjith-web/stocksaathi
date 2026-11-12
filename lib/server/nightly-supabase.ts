// Connects the nightly job to Supabase with the admin client. SERVER ONLY.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NightlyDb, NightlyRows, ShopData } from "@/lib/nightly";
import { rowToItem } from "@/lib/data/rows";

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
      const { data: items, error: e1 } = await sb.from("items").select("*").eq("shop_id", shopId).eq("is_active", true);
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
      };
    },

    async saveRows(rows: NightlyRows) {
      // One night, one item, one model = one row. Saving again the same night replaces it.
      await upsert("model_forecasts", rows.modelForecasts, "item_id,run_date,model");
      await upsert("model_scores", rows.modelScores, "item_id,run_date,model");
      await upsert("final_forecasts", rows.finalForecasts, "item_id,run_date");
    },
  };
}
