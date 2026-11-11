"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Glass from "@/components/ui/Glass";
import DotIcon from "@/components/ui/DotIcon";
import { DotLabel } from "@/components/ui/DotText";

type Result = { saved: number; errors: { line: number; issue: string }[] };

export default function CsvUpload() {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    const res = await fetch("/api/upload", { method: "POST", body: await file.text() });
    setBusy(false);
    if (!res.ok) { setResult({ saved: 0, errors: [{ line: 0, issue: await res.text() }] }); return; }
    setResult(await res.json());
    router.refresh();
  }

  return (
    <Glass as="section" blur={false} className="space-y-2 p-4">
      <h2><DotLabel>Upload past sales (CSV)</DotLabel></h2>
      <p className="text-sm text-ink-2">Three columns: date (YYYY-MM-DD), item_name, quantity.</p>
      <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        className="field block w-full py-1.5 text-sm file:mr-3 file:min-h-[36px] file:cursor-pointer file:rounded-full file:border-0 file:bg-ink file:px-4 file:font-semibold file:text-inverse" />
      {busy && <p className="text-sm">Uploading…</p>}
      {result && (
        <div className="text-sm">
          <p className="flex items-center gap-2 font-semibold"><DotIcon name="check" size={18} />{result.saved} rows saved</p>
          {result.errors.length > 0 && (
            <ul role="alert" className="glass-alert mt-2 max-h-40 space-y-1 overflow-auto rounded-[16px] border p-3 font-semibold">
              {result.errors.map((e, i) => <li key={i}>{e.line ? `Row ${e.line}: ` : ""}{e.issue}</li>)}
            </ul>
          )}
        </div>
      )}
    </Glass>
  );
}
