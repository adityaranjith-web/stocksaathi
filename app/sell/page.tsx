import { getStore } from "@/lib/data";
import { asOfDay } from "@/lib/dates";
import { addDays } from "@/lib/forecast/desk";
import SellGrid from "@/components/SellGrid";
import { getMe } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SellPage() {
  const me = await getMe();
  const store = getStore();
  const [items, sales] = await Promise.all([store.listItems(), store.listSales(addDays(asOfDay(), -13))]);
  const sold = new Map<string, number>();
  for (const s of sales) sold.set(s.itemId, (sold.get(s.itemId) ?? 0) + s.qty);
  // Fastest sellers first, so the helper finds them without scrolling.
  const sorted = [...items].sort((a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0));
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Record a sale</h1>
      <p className="mb-4 text-sm text-ink-2">Tap the item sold. Fastest sellers are at the top.</p>
      {/* A helper sees item names and pack sizes only (BRD section 7). The price is not even sent to their phone. */}
      <SellGrid items={sorted.map((i) => ({ id: i.id, name: i.name, pack: i.pack, price: me?.role === "owner" ? i.price : null }))} />
    </div>
  );
}
