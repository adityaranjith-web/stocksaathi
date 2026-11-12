import { getStore } from "@/lib/data";
import { ownerOnly } from "@/lib/auth";
import { runShadow } from "@/lib/forecast/ai/shadow";

export const maxDuration = 60; // seconds: the AI may be slow, and the run stops asking after 45

// Runs the AI provider over every item and saves the answers for checking. It never changes an order by itself.
// A problem with the AI itself (free limit used up, service down) is not an error: the answer says what was saved.
export async function POST() {
  const denied = await ownerOnly();
  if (denied) return denied;
  try {
    return Response.json(await runShadow(getStore()));
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
