"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import NumberInput from "@/components/ui/NumberInput";
import DotIcon from "@/components/ui/DotIcon";
import { ConfidenceBadge } from "@/components/ui/Badge";
import { DotLabel, DotNumber } from "@/components/ui/DotText";
import { clock, formatPrepTime } from "@/lib/prep-time";

export type Line = { itemId: string; name: string; pack: string; stock: number; suggested: number; confidence: "High" | "Medium" | "Low"; perDay: number };
export type Group = { distributor: { id: string; name: string; salesman: string; whatsapp: string }; lines: Line[] };

function waLink(number: string, text: string) {
  const digits = number.replace(/\D/g, "");
  // Masked or missing numbers open WhatsApp with the text so the owner can pick the contact.
  const valid = digits.length >= 10 && !/x/i.test(number);
  return `https://wa.me/${valid ? digits : ""}?text=${encodeURIComponent(text)}`;
}

/**
 * KPI 2: how long it takes to prepare an order. Starts when the list opens and stops at Share.
 * Time with the phone screen off or the app in the background is not counted. The clock restarts after each Share.
 */
function usePrepTimer() {
  const [seconds, setSeconds] = useState(0);
  const elapsedMs = useRef(0);
  const last = useRef(0);
  useEffect(() => {
    last.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === "visible") elapsedMs.current += Math.min(now - last.current, 2000);
      last.current = now;
      setSeconds(Math.floor(elapsedMs.current / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return {
    seconds,
    /** Seconds counted so far. */
    read: () => Math.round(elapsedMs.current / 1000),
    /** Start again from zero (after an order is shared). */
    reset() { elapsedMs.current = 0; last.current = Date.now(); setSeconds(0); },
  };
}

export default function ReorderList({ groups, shopName }: { groups: Group[]; shopName: string }) {
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(groups.flatMap((g) => g.lines.map((l) => [l.itemId, l.suggested]))));
  const [sent, setSent] = useState<Record<string, string>>({});
  const [took, setTook] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = usePrepTimer();

  async function share(g: Group) {
    setBusy(g.distributor.id);
    const lines = g.lines.map((l) => ({ itemId: l.itemId, qty: qty[l.itemId] ?? 0 })).filter((l) => l.qty > 0);
    const first = !sent[g.distributor.id]; // sharing the same order again is not a new order, so it is not timed
    const prepSeconds = first ? timer.read() : null; // the moment Share was tapped
    const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ distributorId: g.distributor.id, lines, prepSeconds }) });
    setBusy(null);
    if (!res.ok) { setError("Order not saved. Please try again."); return; }
    setError(null);
    const { orderId } = await res.json();
    if (first && prepSeconds !== null) {
      setTook((t) => ({ ...t, [g.distributor.id]: formatPrepTime(prepSeconds) }));
      timer.reset();
    }
    const text = [
      `Order from ${shopName} (${orderId})`,
      ...g.lines.filter((l) => (qty[l.itemId] ?? 0) > 0).map((l, i) => `${i + 1}. ${l.name} ${l.pack} x ${qty[l.itemId]}`),
      "Please confirm delivery date. Thank you.",
    ].join("\n");
    setSent((s) => ({ ...s, [g.distributor.id]: orderId }));
    window.open(waLink(g.distributor.whatsapp, text), "_blank");
  }

  return (
    <div className="space-y-4">
      <Glass blur={false} className="flex items-center justify-between gap-3 p-4">
        <div>
          <DotLabel>Order timer</DotLabel>
          <p className="mt-1 text-xs text-ink-2">Target: under 5 minutes to prepare an order</p>
        </div>
        <span role="timer" aria-label="Time spent on this order list"><DotNumber size={40}>{clock(timer.seconds)}</DotNumber></span>
      </Glass>
      {error && <Glass blur={false} alert role="alert" className="flex items-center gap-3 p-4 text-sm font-semibold"><DotIcon name="alert" size={22} />{error}</Glass>}
      {groups.map((g, gi) => (
        <Glass key={g.distributor.id} blur={false} delay={Math.min(gi, 4)} className="p-4">
          <DotLabel>{g.distributor.name}</DotLabel>
          <p className="mb-2 mt-1 text-sm text-ink-2">Salesman: {g.distributor.salesman}</p>
          <ul className="divide-y divide-line">
            {g.lines.map((l) => (
              <li key={l.itemId} className="py-3">
                <Link href={`/item/${l.itemId}`} className="block min-h-[44px]">
                  <p className="font-semibold leading-tight">{l.name}</p>
                  <p className="text-xs text-ink-2">{l.stock} in stock · sells {l.perDay.toFixed(1)}/day</p>
                  <span className="mt-1.5 inline-flex items-center gap-2"><ConfidenceBadge level={l.confidence} /><span className="text-xs font-semibold underline">Why?</span></span>
                </Link>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-ink-2">Quantity to order</span>
                  <NumberInput id={`q-${l.itemId}`} label={`quantity for ${l.name}`} value={qty[l.itemId] ?? 0} onChange={(n) => setQty((s) => ({ ...s, [l.itemId]: n }))} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <Button full icon={sent[g.distributor.id] ? "check" : "share"} onClick={() => share(g)} disabled={busy === g.distributor.id}>
              {sent[g.distributor.id] ? `Sent as ${sent[g.distributor.id]} · share again` : "Share order on WhatsApp"}
            </Button>
            {took[g.distributor.id] && <p role="status" className="mt-2 text-center text-sm font-semibold">Order prepared in {took[g.distributor.id]}</p>}
          </div>
        </Glass>
      ))}
    </div>
  );
}
