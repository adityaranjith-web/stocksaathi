import { getStore } from "@/lib/data";
import { ownerOnly } from "@/lib/auth";
import { runShadow } from "@/lib/forecast/ai/shadow";

// Runs the AI provider over every item and saves the answers for checking. It never changes an order by itself.
export async function POST() {
  const denied = await ownerOnly();
  if (denied) return denied;
  try {
    return Response.json(await runShadow(getStore()));
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
