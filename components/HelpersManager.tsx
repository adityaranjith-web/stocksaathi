"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import Field, { FormMessage } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { DotLabel } from "@/components/ui/DotText";
import { sendJson } from "@/lib/api-client";

type Helper = { id: string; name: string; email: string; status: "Active" | "Invited" };

// The owner adds a helper by Google email. The helper signs in with that Google account and sees only the Sell screen.
export default function HelpersManager({ helpers }: { helpers: Helper[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setOk(null);
    const r = await sendJson("POST", "/api/helpers", { email, name });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setOk(`${email} can now sign in with Google and record sales.`);
    setEmail(""); setName("");
    router.refresh();
  }

  async function remove(h: Helper) {
    if (!window.confirm(`Remove ${h.name || h.email}? They will not be able to record sales.`)) return;
    const r = await sendJson("DELETE", `/api/helpers?id=${encodeURIComponent(h.id)}`);
    if (!r.ok) { setError(r.error); return; }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Glass as="form" onSubmit={add} blur={false} className="space-y-4 p-4">
        <h2><DotLabel>Add a helper</DotLabel></h2>
        <Field label="Google email" hint="The email of the Google account on the helper's phone">
          <input className="field w-full" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" required />
        </Field>
        <Field label="Name"><input className="field w-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></Field>
        <FormMessage error={error} ok={ok} />
        <Button full icon="plus" disabled={busy}>Add helper</Button>
      </Glass>

      <Glass blur={false} className="p-4">
        <h2 className="mb-2"><DotLabel>Your helpers</DotLabel></h2>
        {helpers.length === 0 && <p className="text-sm text-ink-2">No helpers yet.</p>}
        <ul className="divide-y divide-line">
          {helpers.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{h.name || h.email}</p>
                <p className="truncate text-xs text-ink-2">{h.email || "Email not shown"}</p>
                <div className="mt-1"><Badge>{h.status === "Invited" ? "Waiting for first sign-in" : "Active"}</Badge></div>
              </div>
              <Button type="button" variant="ghost" onClick={() => remove(h)}>Remove</Button>
            </li>
          ))}
        </ul>
      </Glass>
    </div>
  );
}
