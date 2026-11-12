"use client";
import { useState } from "react";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import DotIcon from "@/components/ui/DotIcon";
import { DotLabel } from "@/components/ui/DotText";
import { HOW_IT_WORKS, HOW_IT_WORKS_COOKIE } from "@/lib/screen-help";

// Four steps on Home. The owner can close it. The choice is kept in a cookie on this phone for a year,
// and Home reads it on the server, so a closed card does not show again.
export default function HowItWorks({ delay }: { delay: number }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  function close() {
    try { document.cookie = `${HOW_IT_WORKS_COOKIE}=1; path=/; max-age=31536000; SameSite=Lax`; } catch { /* the card just comes back next time */ }
    setOpen(false);
  }

  return (
    <Glass as="section" aria-label={HOW_IT_WORKS.title} blur={false} delay={delay} className="space-y-3 p-4">
      <h2><DotLabel>{HOW_IT_WORKS.title}</DotLabel></h2>
      <ol className="space-y-3">
        {HOW_IT_WORKS.steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0"><DotIcon name={s.icon} size={24} /></span>
            <span className="min-w-0">
              <span className="block font-semibold">{i + 1}. {s.title}</span>
              <span className="block text-sm text-ink-2">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <Button variant="ghost" full onClick={close} type="button" aria-label="Close the How StockSaathi works card">Close</Button>
    </Glass>
  );
}
