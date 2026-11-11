import { getStore } from "@/lib/data";
import { ownerOnly } from "@/lib/auth";
import { checkEmail } from "@/lib/validate";

// POST { email, name } = the owner adds a helper by Google email. DELETE ?id=... = remove a helper.
export async function POST(req: Request) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const body = await req.json();
  const email = checkEmail(body?.email);
  if (!email.ok) return new Response(email.error, { status: 400 });
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  try {
    await getStore().addHelper(email.value, name);
    return Response.json({ ok: true });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return new Response("Missing helper", { status: 400 });
  try {
    await getStore().removeHelper(id);
    return Response.json({ ok: true });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
