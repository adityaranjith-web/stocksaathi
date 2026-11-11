"use client";
import { useState } from "react";
import Glass from "./Glass";
import Button from "./Button";
import NumberInput from "./NumberInput";
import Toast from "./Toast";
import DotIcon, { type DotIconName } from "./DotIcon";
import { Badge, ConfidenceBadge } from "./Badge";
import { DotLabel, DotNumber } from "./DotText";

const ICONS: DotIconName[] = ["home", "sell", "reorder", "stock", "alert", "check", "share", "back", "next", "layers", "plus", "minus"];
const SWATCHES = [
  ["--ink", "Text"], ["--ink-2", "Secondary text"], ["--glass-bg", "Glass fill"], ["--solid-bg", "Solid fill"], ["--alert", "Alert (red)"],
];

// Reference page for the design system. Open /design to check every part in light and dark mode.
export default function DesignDemo() {
  const [qty, setQty] = useState(12);
  const [toast, setToast] = useState<"ok" | "alert" | null>(null);
  const show = (t: "ok" | "alert") => { setToast(t); setTimeout(() => setToast(null), 2200); };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Design system</h1>

      <Glass className="space-y-3 p-4">
        <DotLabel>Colours</DotLabel>
        <div className="grid grid-cols-5 gap-2">
          {SWATCHES.map(([v, n]) => (
            <div key={v} className="text-center text-[11px] leading-tight text-ink-2">
              <div className="mx-auto mb-1 h-10 w-10 rounded-full border border-[color:var(--field-edge)]" style={{ background: `var(${v})` }} />{n}
            </div>
          ))}
        </div>
      </Glass>

      <Glass className="space-y-3 p-4" dots>
        <DotLabel>Glass card with blur</DotLabel>
        <DotNumber size={64}>0786</DotNumber>
        <p className="text-sm text-ink-2">Use real blur on a few big panels only. Lists and grids use the flat version below.</p>
      </Glass>
      <Glass blur={false} className="space-y-1 p-4">
        <DotLabel>Flat glass card (no blur)</DotLabel>
        <p className="text-sm text-ink-2">Same edge and shadow. Fast on cheap phones.</p>
      </Glass>

      <Glass blur={false} className="space-y-3 p-4">
        <DotLabel>Buttons</DotLabel>
        <Button full icon="sell">Record a sale</Button>
        <Button full variant="ghost" icon="share">Share order on WhatsApp</Button>
        <Button full variant="alert" icon="alert">Delete all data</Button>
      </Glass>

      <Glass blur={false} className="space-y-3 p-4">
        <DotLabel>Number input</DotLabel>
        <NumberInput id="demo-qty" label="quantity" value={qty} onChange={setQty} />
      </Glass>

      <Glass blur={false} className="space-y-3 p-4">
        <DotLabel>Badges</DotLabel>
        <div className="flex flex-wrap gap-2">
          <Badge>Demo data</Badge>
          <ConfidenceBadge level="High" />
          <ConfidenceBadge level="Medium" />
          <ConfidenceBadge level="Low" />
          <Badge tone="alert">Check this</Badge>
        </div>
      </Glass>

      <Glass blur={false} className="space-y-3 p-4">
        <DotLabel>Toast</DotLabel>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => show("ok")}>Show saved</Button>
          <Button variant="ghost" onClick={() => show("alert")}>Show error</Button>
        </div>
      </Glass>

      <Glass blur={false} className="space-y-3 p-4">
        <DotLabel>Dot icons</DotLabel>
        <div className="grid grid-cols-6 gap-3">{ICONS.map((n) => <div key={n} className="grid place-items-center gap-1 text-[10px] text-ink-2"><DotIcon name={n} size={32} />{n}</div>)}</div>
      </Glass>

      {toast && <Toast tone={toast}>{toast === "ok" ? "Saved: Sugar 1 kg × 2" : "Order not saved. Please try again."}</Toast>}
    </div>
  );
}
