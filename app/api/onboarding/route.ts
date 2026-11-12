import { getStore } from "@/lib/data";
import { AccessError } from "@/lib/data/errors";
import { checkShop } from "@/lib/validate";

// "Create your shop": a signed-in Google user with no shop becomes the owner of a new one.
// The database function create_shop does the real checks (who is calling, consent, one shop per person).
export async function POST(req: Request) {
  const checked = checkShop(await req.json().catch(() => null));
  if (!checked.ok) return new Response(checked.error, { status: 400 });
  try {
    return Response.json(await getStore().createShop(checked.value.name, checked.value.locality, checked.value.consent));
  } catch (e) {
    if (e instanceof AccessError) return new Response("Please sign in first.", { status: 401 });
    return new Response((e as Error).message, { status: 400 });
  }
}
