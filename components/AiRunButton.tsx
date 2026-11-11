"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/Field";
import { sendJson } from "@/lib/api-client";

// Asks the AI model for a forecast for every item and saves the answers for checking. Orders do not change.
export default function AiRunButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null); setOk(null);
    const r = await sendJson("POST", "/api/ai/run");
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    const d = r.data as { saved: number; failed: number; firstError: string | null };
    if (d.failed) setError(`${d.failed} item(s) failed. ${d.firstError ?? ""}`);
    setOk(`Saved ${d.saved} AI forecast(s) for checking.`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <Button full icon="ai" onClick={run} disabled={busy}>{busy ? "Asking the AI…" : "Run AI forecast now"}</Button>
      <FormMessage error={error} ok={ok} />
    </div>
  );
}
