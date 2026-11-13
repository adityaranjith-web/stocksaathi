"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/Field";
import { DotLabel } from "@/components/ui/DotText";
import { sendJson } from "@/lib/api-client";

// "Start your shop", step 3 (optional): units sold on each of the last 7 days, item by item.
// Past sales help the forecast learn faster: with 7 days of sales, the forecast is half your estimate and half your sales.
export default function StartHistoryForm({ items, days }: { items: { id: string; name: string }[]; days: { date: string; label: string }[] }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = (id: string, date: string) => `${id}|${date}`;
  const typed = Object.values(v).filter((x) => x.trim() !== "").length;

  async function save() {
    setBusy(true); setError(null);
    const rows = Object.entries(v).filter(([, qty]) => qty.trim() !== "").map(([k, qty]) => { const [itemId, date] = k.split("|"); return { itemId, date, qty }; });
    const r = await sendJson("POST", "/api/start/history", { rows });
    if (!r.ok) { setBusy(false); setError(r.error); return; }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Glass blur={false} className="space-y-3 p-4">
        <DotLabel>Have a file of past sales?</DotLabel>
        <p className="text-sm text-ink-2">Upload it on the Stock screen instead. It takes any number of days.</p>
        <Button href="/stock" variant="ghost" icon="stock" full>Upload past sales</Button>
      </Glass>

      <Glass blur={false} className="overflow-hidden p-4">
        <h2 className="mb-1"><DotLabel>Or type the last 7 days</DotLabel></h2>
        <p className="mb-3 text-sm text-ink-2">Units sold each day. Leave a box empty if you do not know.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-ink-2">
                <th className="py-1 pr-2 font-semibold">Item</th>
                {days.map((d) => <th key={d.date} className="px-1 text-center text-xs font-semibold">{d.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="max-w-[8rem] py-2 pr-2 font-semibold leading-tight">{i.name}</td>
                  {days.map((d) => (
                    <td key={d.date} className="px-0.5 py-1">
                      <input
                        className="field w-full px-1 text-center" type="number" inputMode="numeric" min={0} style={{ minWidth: "2.6rem" }}
                        aria-label={`${i.name}, ${d.label}`} value={v[key(i.id, d.date)] ?? ""} onChange={(e) => setV((s) => ({ ...s, [key(i.id, d.date)]: e.target.value }))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Glass>

      <Glass blur={false} className="space-y-3 p-4">
        <FormMessage error={error} />
        <Button full icon="check" onClick={save} disabled={busy || typed === 0}>{busy ? "Saving…" : `Save past sales (${typed})`}</Button>
        <Button href="/" variant="ghost" full>Skip for now</Button>
      </Glass>
    </div>
  );
}
