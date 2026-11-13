import { getStore } from "@/lib/data";
import { ownerOnly } from "@/lib/auth";
import { checkStartNumbers } from "@/lib/start-shop";

// "Start your shop", step 2: how many sell per day and how many are in the shop now.
// POST { distributorName?, leadTimeDays?, rows: [{ itemId, perDay, stock, price? }] }. Owner only.
export async function POST(req: Request) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const checked = checkStartNumbers(await req.json().catch(() => null));
  if (!checked.ok) return new Response(checked.error, { status: 400 });
  try {
    return Response.json(await getStore().saveStartNumbers(checked.value));
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
