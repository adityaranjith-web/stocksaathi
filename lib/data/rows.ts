// Turns database rows into the app's own shapes. Shared by the signed-in store and the nightly job.
import type { Item } from "./types";

type ItemRow = {
  id: string; name: string; category: string | null; pack: string | null; price: number | string; distributor_id: string;
  lead_time_days: number; min_safety_stock: number; order_cover_days: number; current_stock: number;
  est_daily_sales?: number | string | null; // migration 0010; missing on an older database
};

export function rowToItem(r: ItemRow): Item {
  return {
    id: r.id, name: r.name, category: r.category ?? "", pack: r.pack ?? "", price: Number(r.price), distributorId: r.distributor_id,
    leadTimeDays: r.lead_time_days, minSafetyStock: r.min_safety_stock, orderCoverDays: r.order_cover_days, currentStock: r.current_stock,
    estimatedPerDay: r.est_daily_sales === null || r.est_daily_sales === undefined ? null : Number(r.est_daily_sales),
  };
}
