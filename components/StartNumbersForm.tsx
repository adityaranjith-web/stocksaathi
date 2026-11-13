"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import Field, { FormMessage } from "@/components/ui/Field";
import { DotLabel } from "@/components/ui/DotText";
import { sendJson } from "@/lib/api-client";

// "Start your shop", step 2: for each item, about how many sell per day and how many are in the shop now.
// The first answer becomes the forecast until the item has 14 days of sales (lib/cold-start.ts).
export default function StartNumbersForm({ items, distributors }: { items: { id: string; name: string; pack: string }[]; distributors: string[] }) {
  const router = useRouter();
  const [distributorName, setDistributorName] = useState("");
  const [leadTime, setLeadTime] = useState("2");
  const [v, setV] = useState<Record<string, { perDay: string; stock: string; price: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cell = (id: string) => v[id] ?? { perDay: "", stock: "", price: "" };
  const set = (id: string, k: "perDay" | "stock" | "price", value: string) => setV((s) => ({ ...s, [id]: { ...cell(id), ...s[id], [k]: value } }));
  const filled = items.filter((i) => cell(i.id).perDay.trim() !== "" && cell(i.id).stock.trim() !== "").length;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await sendJson("POST", "/api/start/numbers", {
      distributorName, leadTimeDays: leadTime, rows: items.map((i) => ({ itemId: i.id, ...cell(i.id) })),
    });
    if (!r.ok) { setBusy(false); setError(r.error); return; }
    router.push("/start/history");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Glass blur={false} className="space-y-3 p-4">
        <DotLabel>For all these items</DotLabel>
        <Field label="Distributor name (optional)" hint="Who you order these from. Leave empty to use one called My distributor.">
          <input className="field w-full" value={distributorName} onChange={(e) => setDistributorName(e.target.value)} maxLength={80} list="start-distributors" autoComplete="off" />
          <datalist id="start-distributors">{distributors.map((d) => <option key={d} value={d} />)}</datalist>
        </Field>
        <Field label="Lead time in days" hint="Days from ordering to delivery. 2 is usual.">
          <input className="field w-full" type="number" inputMode="numeric" min={0} max={60} value={leadTime} onChange={(e) => setLeadTime(e.target.value)} />
        </Field>
      </Glass>

      {items.map((i) => (
        <Glass key={i.id} blur={false} className="space-y-3 p-4">
          <p className="font-semibold leading-tight">{i.name}{i.pack ? <span className="text-sm font-normal text-ink-2"> · {i.pack}</span> : null}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="About how many sell per day?">
              <input className="field w-full" type="number" inputMode="decimal" min={0} step="any" value={cell(i.id).perDay} onChange={(e) => set(i.id, "perDay", e.target.value)} />
            </Field>
            <Field label="How many in the shop now?">
              <input className="field w-full" type="number" inputMode="numeric" min={0} value={cell(i.id).stock} onChange={(e) => set(i.id, "stock", e.target.value)} />
            </Field>
          </div>
          <Field label="Price in rupees (optional)">
            <input className="field w-full" type="number" inputMode="decimal" min={0} step="any" value={cell(i.id).price} onChange={(e) => set(i.id, "price", e.target.value)} />
          </Field>
        </Glass>
      ))}

      <Glass blur={false} className="space-y-3 p-4">
        <DotLabel>{filled} of {items.length} done</DotLabel>
        <p className="text-sm text-ink-2">Items you leave empty can be done later. A rough guess is fine. Your own sales will take over.</p>
        <FormMessage error={error} />
        <Button full icon="check" disabled={busy || filled === 0}>{busy ? "Saving…" : "Save and continue"}</Button>
      </Glass>
    </form>
  );
}
