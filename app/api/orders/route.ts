import { getStore } from "@/lib/data";

export async function POST(req: Request) {
  const { distributorId, lines } = await req.json();
  if (typeof distributorId !== "string" || !Array.isArray(lines) || !lines.length) return new Response("Bad order", { status: 400 });
  const clean = lines.filter((l) => typeof l.itemId === "string" && Number.isInteger(l.qty) && l.qty > 0);
  if (!clean.length) return new Response("No quantities", { status: 400 });
  try {
    return Response.json(await getStore().createOrder(distributorId, clean));
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
