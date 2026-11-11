import { getStore } from "@/lib/data";
import { ownerOnly } from "@/lib/auth";
import { checkItem } from "@/lib/validate";

// POST = add an item. PUT = change an item ({ id, ...fields }). DELETE ?id=... = stop selling (hide) an item.
export async function POST(req: Request) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const checked = checkItem(await req.json());
  if (!checked.ok) return new Response(checked.error, { status: 400 });
  try {
    return Response.json(await getStore().saveItem(null, checked.value));
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const body = await req.json();
  if (typeof body?.id !== "string") return new Response("Missing item", { status: 400 });
  const checked = checkItem(body);
  if (!checked.ok) return new Response(checked.error, { status: 400 });
  try {
    return Response.json(await getStore().saveItem(body.id, checked.value));
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return new Response("Missing item", { status: 400 });
  try {
    await getStore().archiveItem(id);
    return Response.json({ ok: true });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
