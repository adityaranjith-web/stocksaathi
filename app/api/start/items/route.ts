import { getStore } from "@/lib/data";
import { ownerOnly } from "@/lib/auth";
import { checkStarterItems } from "@/lib/start-shop";

// "Start your shop", step 1: add the ticked items. POST { items: [{ name, pack }] }. Owner only.
export async function POST(req: Request) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const checked = checkStarterItems(await req.json().catch(() => null));
  if (!checked.ok) return new Response(checked.error, { status: 400 });
  try {
    return Response.json(await getStore().addStarterItems(checked.value));
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
