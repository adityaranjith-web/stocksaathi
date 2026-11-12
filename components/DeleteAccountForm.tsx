"use client";
import { useState } from "react";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import Field, { FormMessage } from "@/components/ui/Field";
import { DotLabel } from "@/components/ui/DotText";
import { sendJson } from "@/lib/api-client";

// BRD section 7: the owner can delete the account and all shop data. Typing the shop name stops accidents.
export default function DeleteAccountForm({ shopName, live }: { shopName: string; live: boolean }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const matches = typed.trim().toLowerCase() === shopName.trim().toLowerCase();

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (!matches || !window.confirm("This cannot be undone. Delete your account and all shop data now?")) return;
    setBusy(true); setError(null);
    const r = await sendJson("DELETE", "/api/account", { confirm: typed });
    if (!r.ok) { setBusy(false); setError(r.error); return; }
    window.location.assign("/login");
  }

  return (
    <Glass as="form" onSubmit={remove} blur={false} alert className="space-y-4 p-4">
      <h2><DotLabel>Delete my account</DotLabel></h2>
      <p className="text-sm font-semibold">This deletes <b>{shopName}</b> and everything in it. It cannot be undone.</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>All items, distributors, sales, orders and deliveries</li>
        <li>All saved forecasts</li>
        <li>Your helpers and their sign-ins</li>
        <li>Your own sign-in record</li>
      </ul>
      {!live && <p className="text-sm font-semibold">Demo mode has no accounts, so nothing can be deleted here. Restart the server to reset the demo data.</p>}
      <Field label={`Type the shop name to confirm: ${shopName}`}>
        <input className="field w-full" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={!live} />
      </Field>
      <FormMessage error={error} />
      <Button full variant="alert" icon="alert" disabled={!live || busy || !matches}>Delete my account and all shop data</Button>
    </Glass>
  );
}
