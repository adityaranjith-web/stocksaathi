"use client";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Field, { FormMessage } from "@/components/ui/Field";
import { DotLabel } from "@/components/ui/DotText";
import { sendJson } from "@/lib/api-client";

// "Demo login": email and password for the two demo accounts (one owner, one helper), for reviewers.
// The passwords are not in the app. Supabase checks them (see docs/live-setup.md, section 8).
export default function DemoLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await sendJson("POST", "/api/demo-login", { email, password });
    if (!r.ok) { setBusy(false); setError(r.error); return; }
    window.location.assign("/"); // a full reload, so the whole app sees the new sign-in
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-line pt-4 text-left">
      <h2 className="text-center"><DotLabel>Demo login</DotLabel></h2>
      <p className="text-center text-sm text-ink-2">For reviewers. Use the demo email and password you were given.</p>
      <Field label="Demo email">
        <input className="field w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} />
      </Field>
      <Field label="Password">
        <input className="field w-full" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={200} autoComplete="current-password" />
      </Field>
      <FormMessage error={error} />
      <Button full icon="next" disabled={busy || !email.trim() || !password}>{busy ? "Signing in…" : "Sign in to the demo"}</Button>
    </form>
  );
}
