"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/Field";
import { DotLabel } from "@/components/ui/DotText";
import { sendJson } from "@/lib/api-client";

// For the owner on the product team: "Close the day" and "Back to real date" (see lib/business-day.ts).
// Each one asks once more before it does anything.
export default function BusinessDayControls({ today, next, simulated, canFill, salesToday, delay }: {
  today: string; next: string; simulated: boolean; canFill: boolean; salesToday: number; delay: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "close" | "back">("idle");
  const [fill, setFill] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function closeDay() {
    setBusy(true); setError(null); setOk(null);
    const r = await sendJson("POST", "/api/day/close", { fillSample: fill });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    const d = r.data as { businessDate: string; sampleRows: number; forecast?: { saved: boolean; note: string | null } };
    setStep("idle"); setFill(false);
    setOk(`${today} is closed. ${d.sampleRows ? `${d.sampleRows} sample sales were added. ` : ""}${d.forecast?.saved ? "The forecast has run again. " : d.forecast?.note ? `${d.forecast.note} ` : ""}`.trim());
    router.refresh();
  }

  async function backToReal() {
    setBusy(true); setError(null); setOk(null);
    const r = await sendJson("POST", "/api/day/reset");
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setStep("idle");
    setOk("The shop is back on the real date.");
    router.refresh();
  }

  return (
    <Glass blur={false} delay={delay} className="space-y-3 p-4">
      <h2><DotLabel>Close the day</DotLabel></h2>
      {step === "idle" && (
        <>
          <p className="text-sm text-ink-2">Done for the day? Today&apos;s sales and deliveries become history, the shop moves to {next}, and the forecast runs again.</p>
          <Button full icon="check" onClick={() => { setStep("close"); setError(null); setOk(null); }}>Close the day</Button>
          {simulated && <Button full variant="ghost" onClick={() => { setStep("back"); setError(null); setOk(null); }}>Back to real date</Button>}
        </>
      )}
      {step === "close" && (
        <>
          <p className="text-sm font-semibold">Close {today} and move to {next}?</p>
          <p className="text-sm text-ink-2">Today&apos;s sales and deliveries are final. The reorder list updates at once.</p>
          {canFill && (
            <label className="flex min-h-[48px] items-start gap-3 text-sm font-semibold">
              <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} className="mt-1 h-6 w-6 shrink-0 accent-[color:var(--ink)]" />
              <span>Fill the day with sample sales<span className="block font-normal text-ink-2">Only {salesToday} sale{salesToday === 1 ? "" : "s"} recorded. Sample sales are marked as sample data.</span></span>
            </label>
          )}
          <Button full icon="check" onClick={closeDay} disabled={busy}>{busy ? "Closing the day…" : "Yes, close the day"}</Button>
          <Button full variant="ghost" onClick={() => setStep("idle")} disabled={busy}>Not now</Button>
        </>
      )}
      {step === "back" && (
        <>
          <p className="text-sm font-semibold">Go back to the real date?</p>
          <p className="text-sm text-ink-2">Sample sales and forecasts for today and later are removed. Real sales are kept.</p>
          <Button full onClick={backToReal} disabled={busy}>{busy ? "Going back…" : "Yes, go back"}</Button>
          <Button full variant="ghost" onClick={() => setStep("idle")} disabled={busy}>Not now</Button>
        </>
      )}
      <FormMessage error={error} ok={ok} />
    </Glass>
  );
}
