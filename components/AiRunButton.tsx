"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/Field";
import { sendJson } from "@/lib/api-client";

// Asks the AI model for a forecast for every item and saves the answers for checking. Orders do not change.
// If the AI cannot answer (it is busy, or the free limit is used up) that is not shown as an error: the Forecast Desk
// carries on as always, and a calm line says so.
export default function AiRunButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null); setOk(null);
    const r = await sendJson("POST", "/api/ai/run");
    setBusy(false);
    if (!r.ok) { setError(r.error); return; } // only a real problem: you are signed out, or AI is off
    const d = r.data as { saved: number; failed: number; stopped: string | null };
    const asFarAsItGot = d.saved ? `Saved ${d.saved} AI forecast(s) for checking.` : "No AI forecast was saved this time.";
    const rest = d.failed || d.stopped ? " The AI could not answer for every item right now. Your orders still use the Forecast Desk, as always." : "";
    setOk(asFarAsItGot + rest);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <Button full icon="ai" onClick={run} disabled={busy}>{busy ? "Asking the AI…" : "Run AI forecast now"}</Button>
      <FormMessage error={error} ok={ok} />
    </div>
  );
}
