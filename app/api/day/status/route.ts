import { getStore } from "@/lib/data";
import { teamOnly } from "@/lib/auth";

export const dynamic = "force-dynamic";

// The shop's date and how many sales are recorded for it RIGHT NOW (owner on the product team only).
// The "Close the day" card reads this when it is shown, so it never shows a count from before the last sale.
export async function GET() {
  const denied = await teamOnly();
  if (denied) return denied;
  const day = await getStore().getBusinessDay();
  return Response.json({ date: day.date, salesToday: day.salesToday }, { headers: { "Cache-Control": "no-store" } });
}
