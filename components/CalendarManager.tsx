"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import Field, { FormMessage } from "@/components/ui/Field";
import { DotLabel } from "@/components/ui/DotText";
import { sendJson } from "@/lib/api-client";

type Day = { date: string; name: string; upliftPct: number };
const show = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// FR8: the product team marks festival and holiday dates. A marked date changes that week's look-alike forecast.
export default function CalendarManager({ days, today }: { days: Day[]; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [uplift, setUplift] = useState("20");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const upcoming = days.filter((d) => d.date >= today);
  const past = days.filter((d) => d.date < today).reverse();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setOk(null);
    const r = await sendJson("POST", "/api/calendar", { date, name, upliftPct: uplift });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setOk(`Saved: ${name} on ${show(date)}.`);
    setDate(""); setName("");
    router.refresh();
  }

  async function remove(d: Day) {
    if (!window.confirm(`Remove ${d.name} (${show(d.date)}) from the calendar?`)) return;
    const r = await sendJson("DELETE", `/api/calendar?date=${d.date}`);
    if (!r.ok) { setError(r.error); return; }
    router.refresh();
  }

  const list = (rows: Day[]) => (
    <ul className="divide-y divide-line">
      {rows.map((d) => (
        <li key={d.date} className="flex items-center justify-between gap-3 py-3">
          <div>
            <p className="font-semibold">{d.name}</p>
            <p className="text-xs text-ink-2">{show(d.date)} · +{d.upliftPct}% sales</p>
          </div>
          <Button type="button" variant="ghost" onClick={() => remove(d)}>Remove</Button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      <Glass as="form" onSubmit={save} blur={false} className="space-y-4 p-4">
        <h2><DotLabel>Add or change a day</DotLabel></h2>
        <Field label="Date"><input className="field w-full" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Field label="Festival or holiday"><input className="field w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Deepavali" maxLength={60} required /></Field>
        <Field label="Extra sales (%)" hint="Our estimate of how much more sells that day. Check it with the owner.">
          <input className="field w-full" type="number" inputMode="numeric" min={0} max={200} value={uplift} onChange={(e) => setUplift(e.target.value)} required />
        </Field>
        <FormMessage error={error} ok={ok} />
        <Button full icon="calendar" disabled={busy}>Save day</Button>
        <p className="text-xs text-ink-2">Using a date that is already on the list changes it.</p>
      </Glass>
      <Glass blur={false} className="p-4">
        <h2 className="mb-1"><DotLabel>Coming up</DotLabel></h2>
        {upcoming.length ? list(upcoming) : <p className="text-sm text-ink-2">No festival dates ahead. Add them so forecasts can plan for them.</p>}
      </Glass>
      {past.length > 0 && (
        <Glass blur={false} className="p-4">
          <h2 className="mb-1"><DotLabel>Past</DotLabel></h2>
          {list(past)}
        </Glass>
      )}
    </div>
  );
}
