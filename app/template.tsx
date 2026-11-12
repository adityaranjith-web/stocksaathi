import { after } from "next/server";
import { headers } from "next/headers";
import { logPerf, recorder } from "@/lib/perf";

// Runs for every page request (unlike the layout, it is not skipped when moving between screens).
// With PERF_LOG=1 it writes one timing line per page after the page has been sent. See lib/perf.ts.
export default async function Template({ children }: { children: React.ReactNode }) {
  if (process.env.PERF_LOG === "1") {
    const rec = recorder();
    const path = (await headers()).get("x-pathname") ?? "?";
    after(() => logPerf(path, rec));
  }
  return <>{children}</>;
}
