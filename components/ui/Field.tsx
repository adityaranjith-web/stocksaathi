import type { ReactNode } from "react";

// A form row: label, optional hint in plain words, then the input.
export default function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      {hint && <span className="block text-xs text-ink-2">{hint}</span>}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

/** A message under a form: green tick for saved, red alert for a problem. */
export function FormMessage({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (error) return <p role="alert" className="glass-alert rounded-[16px] border p-3 text-sm font-semibold">{error}</p>;
  if (ok) return <p role="status" className="text-sm font-semibold">{ok}</p>;
  return null;
}
