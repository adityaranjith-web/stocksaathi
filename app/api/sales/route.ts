import { getStore } from "@/lib/data";

export async function POST(req: Request) {
  const { itemId, qty } = await req.json();
  if (typeof itemId !== "string" || !Number.isInteger(qty) || qty < 1 || qty > 999) return new Response("Bad sale", { status: 400 });
  try {
    await getStore().addSale(itemId, qty, "Quick tap");
    return Response.json({ ok: true });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
