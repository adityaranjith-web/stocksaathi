"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import Field, { FormMessage } from "@/components/ui/Field";
import { sendJson } from "@/lib/api-client";

export interface ItemFormValues {
  id: string; name: string; category: string; pack: string; price: number; distributorId: string;
  leadTimeDays: number; minSafetyStock: number; orderCoverDays: number;
}

// Add or change an item (FR3): price, distributor, lead time, minimum safety stock, order cover days.
export default function ItemForm({ distributors, item }: { distributors: { id: string; name: string }[]; item?: ItemFormValues }) {
  const router = useRouter();
  const [v, setV] = useState({
    name: item?.name ?? "", category: item?.category ?? "", pack: item?.pack ?? "", price: String(item?.price ?? ""),
    distributorId: item?.distributorId ?? distributors[0]?.id ?? "", leadTimeDays: String(item?.leadTimeDays ?? 2),
    minSafetyStock: String(item?.minSafetyStock ?? 2), orderCoverDays: String(item?.orderCoverDays ?? 7), openingStock: "0",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await sendJson(item ? "PUT" : "POST", "/api/items", { ...v, id: item?.id });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    router.push("/setup/items");
    router.refresh();
  }

  async function stopSelling() {
    if (!item || !window.confirm(`Stop selling ${item.name}? It will be hidden from Sell and Reorder. Past sales are kept.`)) return;
    setBusy(true);
    const r = await sendJson("DELETE", `/api/items?id=${encodeURIComponent(item.id)}`);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    router.push("/setup/items");
    router.refresh();
  }

  return (
    <Glass as="form" onSubmit={save} blur={false} className="space-y-4 p-4">
      <Field label="Item name"><input className="field w-full" value={v.name} onChange={set("name")} required maxLength={80} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category"><input className="field w-full" value={v.category} onChange={set("category")} placeholder="Dairy" maxLength={60} /></Field>
        <Field label="Pack size"><input className="field w-full" value={v.pack} onChange={set("pack")} placeholder="500 ml" maxLength={40} /></Field>
      </div>
      <Field label="Price (₹)"><input className="field w-full" type="number" inputMode="decimal" min={0} step="0.5" value={v.price} onChange={set("price")} required /></Field>
      <Field label="Distributor">
        <select className="field w-full" value={v.distributorId} onChange={set("distributorId")} required>
          {distributors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Lead time (days)" hint="Days from ordering to delivery">
          <input className="field w-full" type="number" inputMode="numeric" min={0} max={60} value={v.leadTimeDays} onChange={set("leadTimeDays")} required />
        </Field>
        <Field label="Minimum safety stock" hint="Least stock to keep">
          <input className="field w-full" type="number" inputMode="numeric" min={0} value={v.minSafetyStock} onChange={set("minSafetyStock")} required />
        </Field>
      </div>
      <Field label="Order cover (days)" hint="Days of sales to order each time. 7 is normal. Use 1 for milk and bread.">
        <input className="field w-full" type="number" inputMode="numeric" min={1} max={60} value={v.orderCoverDays} onChange={set("orderCoverDays")} required />
      </Field>
      {!item && (
        <Field label="Stock in hand now" hint="Count the shelf once. After this, sales and deliveries keep it up to date.">
          <input className="field w-full" type="number" inputMode="numeric" min={0} value={v.openingStock} onChange={set("openingStock")} />
        </Field>
      )}
      <FormMessage error={error} />
      <Button full icon="check" disabled={busy}>{item ? "Save changes" : "Add item"}</Button>
      {item && <Button full type="button" variant="ghost" onClick={stopSelling} disabled={busy}>Stop selling this item</Button>}
    </Glass>
  );
}
