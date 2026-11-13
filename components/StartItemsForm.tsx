"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/Field";
import { DotLabel } from "@/components/ui/DotText";
import { sendJson } from "@/lib/api-client";
import type { StarterItem } from "@/lib/start-shop";

// "Start your shop", step 1: tick the items you sell. You can rename an item, change its unit, or add your own.
type Row = { key: string; name: string; pack: string; checked: boolean; own: boolean };

export default function StartItemsForm({ starter, existing }: { starter: StarterItem[]; existing: string[] }) {
  const router = useRouter();
  const have = new Set(existing.map((n) => n.toLowerCase()));
  const [rows, setRows] = useState<Row[]>(() => starter.map((s, i) => ({ key: `s${i}`, name: s.name, pack: s.pack, checked: false, own: false })));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const picked = rows.filter((r) => r.checked && r.name.trim().length >= 1 && !(!r.own && have.has(r.name.trim().toLowerCase())));
  const set = (key: string, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function add() {
    setBusy(true); setError(null);
    const r = await sendJson("POST", "/api/start/items", { items: picked.map((p) => ({ name: p.name, pack: p.pack })) });
    if (!r.ok) { setBusy(false); setError(r.error); return; }
    router.push("/start/numbers");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Glass blur={false} className="divide-y divide-line overflow-hidden">
        {rows.map((r) => {
          const already = !r.own && have.has(r.name.trim().toLowerCase());
          return (
            <div key={r.key} className="flex items-center gap-3 p-3">
              <input
                type="checkbox" checked={r.checked && !already} disabled={already} aria-label={`Add ${r.name || "this item"}`}
                onChange={(e) => set(r.key, { checked: e.target.checked })} className="h-6 w-6 shrink-0 accent-[color:var(--ink)]"
              />
              <div className="min-w-0 flex-1">
                <input className="field w-full" value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} maxLength={80} aria-label="Item name" placeholder="Item name" />
                {already && <p className="mt-0.5 text-xs text-ink-2">Already in your shop</p>}
              </div>
              <input className="field w-24 shrink-0" value={r.pack} onChange={(e) => set(r.key, { pack: e.target.value })} maxLength={30} aria-label={`Unit for ${r.name || "this item"}`} placeholder="Unit" />
            </div>
          );
        })}
      </Glass>

      <Button
        type="button" variant="ghost" full icon="plus"
        onClick={() => setRows((all) => [...all, { key: `o${all.length}`, name: "", pack: "", checked: true, own: true }])}
      >Add your own item</Button>

      <Glass blur={false} className="space-y-3 p-4">
        <DotLabel>{picked.length} item{picked.length === 1 ? "" : "s"} ticked</DotLabel>
        <FormMessage error={error} />
        <Button full icon="check" onClick={add} disabled={busy || picked.length === 0}>{busy ? "Adding…" : `Add selected (${picked.length})`}</Button>
      </Glass>
    </div>
  );
}
