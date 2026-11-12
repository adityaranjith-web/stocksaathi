// Server timing: counts and times every call this app's server makes to Supabase while rendering one page.
// Switch the log on with the environment variable PERF_LOG=1 (Vercel: Settings -> Environment Variables). It is off by
// default. The recording itself is cheap and always on, so the numbers are there when the log is switched on.
//
// One log line per page, for example:
//   [perf] {"path":"/reorder","total_ms":412,"db_calls":9,"round_trips":2,"db_ms":214,"auth":1,"rest":0,"rpc":1,"calls":[["auth","user",118],["rpc","shop_snapshot",96]]}
// total_ms is the server's time to render the page. db_calls is how many calls the code made; round_trips is how many
// really went to Supabase (Next.js answers a repeated identical GET from memory). db_ms adds up the round trips, so it
// can be larger than total_ms when they run at the same time. The middleware makes one more sign-in check per page that is not counted here.
import { cache } from "react";

export type CallKind = "auth" | "rest" | "rpc" | "other";
export interface Call { kind: CallKind; what: string; ms: number; status: number; key: string; method: string }
export interface Recorder { t0: number; calls: Call[] }

/** One recorder per page request (React cache). Outside a page render it simply makes a new one each time. */
export const recorder = cache((): Recorder => ({ t0: performance.now(), calls: [] }));

function classify(url: string, method: string): { kind: CallKind; what: string; key: string } {
  const u = new URL(url);
  const p = u.pathname;
  // key: the same method and address means the same request. Next.js answers a repeated identical GET from memory
  // while one page renders, so only the first of each key is a real round trip to Supabase.
  const key = method + " " + p + u.search;
  if (p.startsWith("/auth/v1/")) return { kind: "auth", what: p.slice("/auth/v1/".length), key };
  if (p.startsWith("/rest/v1/rpc/")) return { kind: "rpc", what: p.slice("/rest/v1/rpc/".length), key };
  if (p.startsWith("/rest/v1/")) return { kind: "rest", what: p.slice("/rest/v1/".length), key };
  return { kind: "other", what: p, key };
}

/** A fetch that records itself. Given to the Supabase client so every database and sign-in call is counted. */
export const timedFetch: typeof fetch = async (input, init) => {
  const t = performance.now();
  const rec = recorder();
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  try {
    const res = await fetch(input, init);
    rec.calls.push({ ...classify(url, method), method, ms: Math.round(performance.now() - t), status: res.status });
    return res;
  } catch (e) {
    rec.calls.push({ ...classify(url, method), method, ms: Math.round(performance.now() - t), status: 0 });
    throw e;
  }
};

export function summarize(path: string, rec: Recorder) {
  // A repeated identical GET is served from memory by Next.js. Only the first of each is a real round trip.
  const seen = new Set<string>();
  const real = rec.calls.filter((c) => (c.method === "GET" ? !seen.has(c.key) && !!seen.add(c.key) : true));
  const count = (k: CallKind) => real.filter((c) => c.kind === k).length;
  return {
    path,
    total_ms: Math.round(performance.now() - rec.t0),
    db_calls: rec.calls.length, // calls made by the code
    round_trips: real.length, // calls that really went to Supabase
    db_ms: real.reduce((a, c) => a + c.ms, 0),
    auth: count("auth"), rest: count("rest"), rpc: count("rpc"),
    calls: real.map((c) => [c.kind, c.what, c.ms]),
  };
}

export function logPerf(path: string, rec: Recorder) {
  console.log(`[perf] ${JSON.stringify(summarize(path, rec))}`);
}
