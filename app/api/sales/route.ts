import { getStore } from "@/lib/data";
import { cleanTapTime } from "@/lib/sale-time";

export async function POST(req: Request) {
  const { itemId, qty, clientTs } = await req.json();
  if (typeof itemId !== "string" || !Number.isInteger(qty) || qty < 1 || qty > 999) return new Response("Bad sale", { status: 400 });
  try {
    // clientTs is sent only for sales saved offline: the same sale sent twice is recorded once.
    await getStore().addSale(itemId, qty, "Quick tap", cleanTapTime(clientTs) ?? undefined);
    return Response.json({ ok: true });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
