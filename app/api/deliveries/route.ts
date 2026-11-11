import { getStore } from "@/lib/data";
import { ownerOnly } from "@/lib/auth";

const okQty = (q: unknown) => Number.isInteger(q) && (q as number) >= 1 && (q as number) <= 100000;

// One delivery: { itemId, qty }.  Many at once: { lines: [{ itemId, qty }, ...] } (the Deliveries screen).
export async function POST(req: Request) {
  const denied = await ownerOnly(); // BR7: only the owner changes stock
  if (denied) return denied;
  const body = await req.json();
  const lines: { itemId: string; qty: number }[] = Array.isArray(body.lines) ? body.lines : [{ itemId: body.itemId, qty: body.qty }];
  if (!lines.length || lines.length > 200 || lines.some((l) => typeof l.itemId !== "string" || !okQty(l.qty))) return new Response("Bad delivery", { status: 400 });
  try {
    const store = getStore();
    for (const l of lines) await store.addDelivery(l.itemId, l.qty);
    return Response.json({ ok: true, saved: lines.length });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
