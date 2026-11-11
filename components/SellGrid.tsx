"use client";
import { useCallback, useEffect, useState } from "react";
import Glass from "@/components/ui/Glass";
import DotIcon from "@/components/ui/DotIcon";
import { DotNumber } from "@/components/ui/DotText";
import Toast from "@/components/ui/Toast";

type Item = { id: string; name: string; pack: string; price: number };
type Pending = { itemId: string; qty: number };
const KEY = "stocksaathi.pendingSales";

function readQueue(): Pending[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function writeQueue(q: Pending[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* storage blocked */ }
}

async function send(p: Pending) {
  const res = await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
  if (!res.ok) throw new Error(await res.text());
}

export default function SellGrid({ items }: { items: Item[] }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  // FR1: sales made while offline are kept on the phone and sent when the network returns.
  const flush = useCallback(async () => {
    const q = readQueue();
    const left: Pending[] = [];
    for (const p of q) { try { await send(p); } catch { left.push(p); } }
    writeQueue(left); setPending(left.length);
  }, []);
  useEffect(() => {
    setPending(readQueue().length);
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);

  async function sell(item: Item) {
    const p = { itemId: item.id, qty: qty[item.id] ?? 1 };
    try {
      await send(p);
      setToast(`Saved: ${item.name} × ${p.qty}`);
    } catch {
      const q = [...readQueue(), p]; writeQueue(q); setPending(q.length);
      setToast(`No network. Saved on phone: ${item.name} × ${p.qty}`);
    }
    setQty((s) => ({ ...s, [item.id]: 1 }));
    setTimeout(() => setToast(null), 2000);
  }

  // Speed on cheap phones: tiles are flat glass (no blur) and have no entrance animation.
  return (
    <>
      {pending > 0 && (
        <Glass blur={false} role="status" className="mb-3 flex items-center gap-2 p-3 text-sm font-semibold">
          <DotIcon name="layers" size={20} />{pending} sale(s) waiting for network
        </Glass>
      )}
      <div className="grid grid-cols-2 gap-3">
        {items.map((it) => {
          const q = qty[it.id] ?? 1;
          return (
            <Glass key={it.id} blur={false} className="p-2">
              <button onClick={() => sell(it)} className="press block min-h-[72px] w-full rounded-[18px] px-3 py-3 text-left active:bg-ink active:text-inverse">
                <span className="block font-semibold leading-tight">{it.name}</span>
                <span className="mt-1 block text-xs opacity-75">{it.pack} · ₹{it.price}</span>
              </button>
              <div className="mt-1 flex items-center justify-between">
                <button aria-label={`Less ${it.name}`} onClick={() => setQty((s) => ({ ...s, [it.id]: Math.max(1, q - 1) }))} className="icon-btn"><DotIcon name="minus" size={20} /></button>
                <span className="flex items-baseline gap-1"><span className="text-sm opacity-75">×</span><DotNumber size={26}>{q}</DotNumber></span>
                <button aria-label={`More ${it.name}`} onClick={() => setQty((s) => ({ ...s, [it.id]: q + 1 }))} className="icon-btn"><DotIcon name="plus" size={20} /></button>
              </div>
            </Glass>
          );
        })}
      </div>
      {toast && <Toast>{toast}</Toast>}
    </>
  );
}
