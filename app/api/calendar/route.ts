import { getStore } from "@/lib/data";
import { teamOnly } from "@/lib/auth";
import { checkCalendarDay } from "@/lib/validate";

// FR8: only the product team edits the festival calendar.
// POST { date, name, upliftPct } = add or change a day. DELETE ?date=YYYY-MM-DD = remove a day.
export async function POST(req: Request) {
  const denied = await teamOnly();
  if (denied) return denied;
  const checked = checkCalendarDay(await req.json());
  if (!checked.ok) return new Response(checked.error, { status: 400 });
  try {
    await getStore().saveCalendarDay(checked.value);
    return Response.json({ ok: true });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const denied = await teamOnly();
  if (denied) return denied;
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Response("Bad date", { status: 400 });
  try {
    await getStore().deleteCalendarDay(date);
    return Response.json({ ok: true });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
