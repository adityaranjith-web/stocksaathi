import { getStore } from "@/lib/data";
import { ownerOnly } from "@/lib/auth";
import { checkDistributor } from "@/lib/validate";

// POST = add a distributor. PUT = change one ({ id, ...fields }).
async function save(req: Request, withId: boolean) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const body = await req.json();
  if (withId && typeof body?.id !== "string") return new Response("Missing distributor", { status: 400 });
  const checked = checkDistributor(body);
  if (!checked.ok) return new Response(checked.error, { status: 400 });
  try {
    return Response.json(await getStore().saveDistributor(withId ? body.id : null, checked.value));
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
export const POST = (req: Request) => save(req, false);
export const PUT = (req: Request) => save(req, true);
