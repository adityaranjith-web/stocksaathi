import { getStore } from "@/lib/data";
import { teamOnly } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Back to the real date (owner on the product team only). Removes everything the simulation made after the real date:
// every sale dated after it (real or sample, with the stock put back) and the saved forecasts. A real sale dated the real
// date is kept. The answer says how many sales were removed.
export async function POST() {
  const denied = await teamOnly();
  if (denied) return denied;
  try {
    return Response.json(await getStore().resetBusinessDate(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
