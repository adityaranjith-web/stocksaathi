"use client";

// Shown when a screen cannot open. In live mode the usual cause is set-up: a migration not run or a key missing.
// The real reason is written to the server log (Vercel -> Logs). /api/health lists what is missing.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="glass space-y-3 p-5 text-center">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="text-sm text-ink-2">This screen could not open. Please try again.</p>
      <p className="text-sm text-ink-2">If it keeps happening, tell the person who set up StockSaathi. They can open <b>/api/health</b> on this site to see what is missing.</p>
      <button type="button" className="btn btn-primary w-full" onClick={reset}>Try again</button>
    </div>
  );
}
