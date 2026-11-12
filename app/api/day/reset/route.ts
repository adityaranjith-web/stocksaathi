import { getStore } from "@/lib/data";
import { teamOnly } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Back to the real date (owner on the product team only). Removes what the simulation made for today and later:
// sample sales (their stock is put back) and saved forecasts. Real sales are never removed.
export async function POST() {
  const denied = await teamOnly();
  if (denied) return denied;
  try {
    return Response.json(await getStore().resetBusinessDate(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
