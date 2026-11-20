"use client";
import { useEffect, useRef, useState } from "react";
import { signOutHere } from "@/lib/sign-out";

// A "Sign out" button that asks first: "Sign out of StockSaathi?" with Yes and Cancel, so it cannot be tapped by accident
// in the middle of a sale. Used in the header of the helper's Sell screen and at the bottom of More. Live mode only.
export default function SignOutConfirm({ variant = "chip" }: { variant?: "chip" | "link" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancel.current?.focus(); // the safe answer is the one under the thumb
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function yes() { setBusy(true); await signOutHere(); }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={variant === "chip"
          ? "glass min-h-[40px] rounded-full px-3 text-sm font-bold"
          : "min-h-[48px] w-full rounded-full border border-line px-4 text-base font-bold"}>
        Sign out
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-6" onClick={() => !busy && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="signout-title" onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs space-y-4 rounded-[24px] p-5 text-ink shadow-2xl" style={{ background: "var(--bg-base)" }}>
            <h2 id="signout-title" className="text-lg font-bold">Sign out of StockSaathi?</h2>
            <p className="text-sm text-ink-2">The next person will need to sign in.</p>
            <div className="grid grid-cols-2 gap-3">
              <button ref={cancel} type="button" onClick={() => setOpen(false)} disabled={busy} className="min-h-[48px] rounded-full border border-line px-4 font-bold">Cancel</button>
              <button type="button" onClick={yes} disabled={busy} className="min-h-[48px] rounded-full bg-ink px-4 font-bold text-inverse">{busy ? "Signing out…" : "Yes, sign out"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
