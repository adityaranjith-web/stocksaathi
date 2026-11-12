import { getStore } from "@/lib/data";
import { ownerOnly } from "@/lib/auth";

// BRD section 7: the owner can delete the account and all shop data. DELETE { confirm: "<shop name>" }.
// The database function delete_my_account checks again that the caller is the owner and the name matches.
export async function DELETE(req: Request) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const confirm = typeof body?.confirm === "string" ? body.confirm : "";
  if (!confirm.trim()) return new Response("Type the shop name to confirm.", { status: 400 });
  try {
    await getStore().deleteMyAccount(confirm);
    return Response.json({ ok: true });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
