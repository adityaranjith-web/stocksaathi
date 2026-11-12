import { getStore } from "@/lib/data";
import { teamOnly } from "@/lib/auth";
import { computeShopDesk } from "@/lib/desk-service";
import { SAMPLE_MIN_SALES, sampleSalesForDay } from "@/lib/business-day";
import { saveForecastsAfterClose } from "@/lib/server/day-close";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds

// Close the day (owner on the product team only). Today's sales and deliveries become history, the shop's date moves
// forward by one, and the Forecast Desk runs again and saves its rows like the nightly job. POST { fillSample?: boolean }.
// fillSample (demo shop only, fewer than 5 sales that day) adds labelled sample sales to the day first.
export async function POST(req: Request) {
  const denied = await teamOnly();
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const fillSample = body?.fillSample === true;
  const store = getStore();
  try {
    const day = await store.getBusinessDay();
    let sample: { itemId: string; qty: number }[] = [];
    if (fillSample) {
      if (!day.sampleShop) return new Response("Sample sales are only for the demo shop.", { status: 400 });
      if (day.salesToday >= SAMPLE_MIN_SALES) return new Response(`This day already has ${SAMPLE_MIN_SALES} or more sales, so it is not filled.`, { status: 400 });
      const desk = await computeShopDesk(store, { useAi: false });
      sample = sampleSalesForDay(day.date, desk.items.map((i) => i.id), desk.sales);
    }
    const closed = await store.closeDay(day.date, sample);
    // The forecast for the day just closed. The database call above is what closes the day; saving the rows must never undo it.
    const forecast = store.mode === "live" ? await saveForecastsAfterClose((await store.getShop()).id) : { saved: false, asOf: null, rows: 0, note: null };
    return Response.json({ ...closed, forecast }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
