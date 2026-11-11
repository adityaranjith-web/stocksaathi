"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import DotIcon from "@/components/ui/DotIcon";
import { DotLabel } from "@/components/ui/DotText";

export default function DeliveryForm({ items }: { items: { id: string; name: string; pack: string }[] }) {
  const router = useRouter();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [bad, setBad] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(qty, 10);
    if (!n || n < 1) { setBad(true); setMsg("Enter how many units arrived."); return; }
    const res = await fetch("/api/deliveries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, qty: n }) });
    if (!res.ok) { setBad(true); setMsg("Not saved. Please try again."); return; }
    setBad(false);
    setMsg(`Saved: ${n} × ${items.find((i) => i.id === itemId)?.name} added to stock.`);
    setQty("");
    router.refresh();
  }

  return (
    <Glass as="form" onSubmit={save} blur={false} className="space-y-3 p-4">
      <h2><DotLabel>Record a delivery</DotLabel></h2>
      <label className="block text-sm font-semibold">Item
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="field mt-1 block w-full">
          {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.pack})</option>)}
        </select>
      </label>
      <label className="block text-sm font-semibold">Units received
        <input type="number" inputMode="numeric" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="field mt-1 block w-full text-lg" />
      </label>
      <Button full icon="check">Save delivery</Button>
      {msg && (
        <p role={bad ? "alert" : "status"} className={`flex items-center gap-2 text-sm font-semibold ${bad ? "text-alert" : ""}`}>
          <DotIcon name={bad ? "alert" : "check"} size={18} />{msg}
        </p>
      )}
    </Glass>
  );
}
