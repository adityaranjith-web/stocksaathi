"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import NumberInput from "@/components/ui/NumberInput";
import Toast from "@/components/ui/Toast";
import { FormMessage } from "@/components/ui/Field";
import { DotLabel } from "@/components/ui/DotText";
import { sendJson } from "@/lib/api-client";

export type DeliveryGroup = {
  orderId: string; distributorName: string; orderedOn: string;
  lines: { itemId: string; name: string; pack: string; ordered: number; stock: number }[];
};

// Items with open orders, quantity filled in from the order, one Save for all of them.
export default function DeliveriesForm({ groups }: { groups: DeliveryGroup[] }) {
  const router = useRouter();
  const key = (g: DeliveryGroup, itemId: string) => `${g.orderId}:${itemId}`;
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(groups.flatMap((g) => g.lines.map((l) => [key(g, l.itemId), l.ordered]))));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function save() {
    const lines = groups.flatMap((g) => g.lines.map((l) => ({ itemId: l.itemId, qty: qty[key(g, l.itemId)] ?? 0 }))).filter((l) => l.qty > 0);
    if (!lines.length) { setError("Enter how many units arrived."); return; }
    setBusy(true); setError(null);
    const r = await sendJson("POST", "/api/deliveries", { lines });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setToast(`Saved: ${lines.length} item(s) added to stock`);
    setTimeout(() => setToast(null), 2200);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {groups.map((g, gi) => (
        <Glass key={g.orderId} blur={false} delay={Math.min(gi, 4)} className="p-4">
          <DotLabel>{g.distributorName}</DotLabel>
          <p className="mb-1 mt-1 text-xs text-ink-2">Ordered on {new Date(g.orderedOn + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}</p>
          <ul className="divide-y divide-line">
            {g.lines.map((l) => (
              <li key={l.itemId} className="py-3">
                <p className="font-semibold leading-tight">{l.name} <span className="text-sm font-normal text-ink-2">{l.pack}</span></p>
                <p className="text-xs text-ink-2">{l.ordered} ordered · {l.stock} in stock now</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-ink-2">Units received</span>
                  <NumberInput id={`d-${key(g, l.itemId)}`} label={`units received for ${l.name}`} value={qty[key(g, l.itemId)] ?? 0} onChange={(n) => setQty((s) => ({ ...s, [key(g, l.itemId)]: n }))} />
                </div>
              </li>
            ))}
          </ul>
        </Glass>
      ))}
      <FormMessage error={error} />
      <Button full icon="check" onClick={save} disabled={busy}>Save all deliveries</Button>
      <p className="px-1 text-xs text-ink-2">Stock = old stock + delivered. A line is closed when you save it, even if fewer units arrived. Set a line to 0 to leave it open.</p>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
