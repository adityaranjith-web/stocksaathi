"use client";
import { useState } from "react";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import Field, { FormMessage } from "@/components/ui/Field";
import { DotLabel } from "@/components/ui/DotText";
import { sendJson } from "@/lib/api-client";

// First sign-in with no shop and no helper invite: name the shop and agree to the privacy notice.
export default function CreateShopForm() {
  const [name, setName] = useState("");
  const [locality, setLocality] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await sendJson("POST", "/api/onboarding", { name, locality, consent: agree });
    if (!r.ok) { setBusy(false); setError(r.error); return; }
    window.location.assign("/"); // a full reload, so the whole app sees the new shop
  }

  return (
    <Glass as="form" onSubmit={create} blur={false} className="space-y-4 p-4">
      <h2><DotLabel>Your shop</DotLabel></h2>
      <Field label="Shop name"><input className="field w-full" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="organization" /></Field>
      <Field label="Place" hint="Town or area, for example Adyar">
        <input className="field w-full" value={locality} onChange={(e) => setLocality(e.target.value)} maxLength={80} />
      </Field>
      <label className="flex min-h-[48px] items-start gap-3 text-sm font-semibold">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-6 w-6 shrink-0 accent-[color:var(--ink)]" />
        <span>I have read the privacy notice above and I agree.</span>
      </label>
      <FormMessage error={error} />
      <Button full icon="check" disabled={busy || !agree || name.trim().length < 2}>Create my shop</Button>
    </Glass>
  );
}
