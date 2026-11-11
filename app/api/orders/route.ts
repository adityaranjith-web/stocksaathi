import { getStore } from "@/lib/data";
import { ownerOnly } from "@/lib/auth";
import { cleanPrepSeconds } from "@/lib/prep-time";

export async function POST(req: Request) {
  const denied = await ownerOnly(); // BR7: only the owner sends orders
  if (denied) return denied;
  const { distributorId, lines, prepSeconds } = await req.json();
  if (typeof distributorId !== "string" || !Array.isArray(lines) || !lines.length) return new Response("Bad order", { status: 400 });
  const clean = lines.filter((l) => typeof l.itemId === "string" && Number.isInteger(l.qty) && l.qty > 0);
  if (!clean.length) return new Response("No quantities", { status: 400 });
  try {
    return Response.json(await getStore().createOrder(distributorId, clean, cleanPrepSeconds(prepSeconds))); // KPI 2: time to prepare
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
