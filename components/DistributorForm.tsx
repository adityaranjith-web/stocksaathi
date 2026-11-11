"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import Field, { FormMessage } from "@/components/ui/Field";
import { sendJson } from "@/lib/api-client";

export interface DistributorFormValues { id?: string; name: string; supplies: string; salesman: string; whatsapp: string; visitDay: string }
const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Add or change a distributor. The WhatsApp number is where orders are sent.
export default function DistributorForm({ distributor }: { distributor?: DistributorFormValues }) {
  const router = useRouter();
  const [v, setV] = useState({ name: distributor?.name ?? "", supplies: distributor?.supplies ?? "", salesman: distributor?.salesman ?? "", whatsapp: distributor?.whatsapp ?? "", visitDay: distributor?.visitDay ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await sendJson(distributor ? "PUT" : "POST", "/api/distributors", { ...v, id: distributor?.id });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    router.push("/setup/distributors");
    router.refresh();
  }

  return (
    <Glass as="form" onSubmit={save} blur={false} className="space-y-4 p-4">
      <Field label="Distributor name"><input className="field w-full" value={v.name} onChange={set("name")} required maxLength={80} /></Field>
      <Field label="What they supply"><input className="field w-full" value={v.supplies} onChange={set("supplies")} placeholder="Dairy, bread" maxLength={120} /></Field>
      <Field label="Salesman name"><input className="field w-full" value={v.salesman} onChange={set("salesman")} maxLength={60} /></Field>
      <Field label="WhatsApp number" hint="Orders are sent to this number. Example: +91 98765 43210">
        <input className="field w-full" type="tel" inputMode="tel" value={v.whatsapp} onChange={set("whatsapp")} maxLength={20} />
      </Field>
      <Field label="Usual visit day">
        <select className="field w-full" value={v.visitDay} onChange={set("visitDay")}>
          {DAYS.map((d) => <option key={d} value={d}>{d || "Not fixed"}</option>)}
        </select>
      </Field>
      <FormMessage error={error} />
      <Button full icon="check" disabled={busy}>{distributor ? "Save changes" : "Add distributor"}</Button>
    </Glass>
  );
}
