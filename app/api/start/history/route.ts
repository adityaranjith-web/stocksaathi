import { getStore } from "@/lib/data";
import { ownerOnly } from "@/lib/auth";
import { addDays } from "@/lib/forecast/desk";
import { asOfFor } from "@/lib/business-day";
import { checkStartHistory } from "@/lib/start-shop";

// "Start your shop", step 3 (optional): past sales typed in a day-by-day table, for the last 7 complete days.
// POST { rows: [{ itemId, date, qty }] }. Owner only.
export async function POST(req: Request) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const store = getStore();
  try {
    const to = asOfFor((await store.getBusinessDay()).date);
    const checked = checkStartHistory(await req.json().catch(() => null), { from: addDays(to, -6), to });
    if (!checked.ok) return new Response(checked.error, { status: 400 });
    return Response.json(await store.saveStartHistory(checked.value));
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
