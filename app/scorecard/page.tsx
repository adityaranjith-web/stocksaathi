import { getStore } from "@/lib/data";
import { requireOwner } from "@/lib/auth";
import { buildScorecard } from "@/lib/scorecard-service";
import { formatPrepTime } from "@/lib/prep-time";
import { niceDate } from "@/lib/dates";
import { addDays } from "@/lib/forecast/desk";
import Glass from "@/components/ui/Glass";
import DotIcon from "@/components/ui/DotIcon";
import { DotLabel, DotNumber } from "@/components/ui/DotText";

export const dynamic = "force-dynamic";

function Met({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <p className="mt-2 flex items-center gap-2 text-sm font-semibold">{ok && <DotIcon name="check" size={18} />}{children}</p>;
}

// FR10: the weekly scorecard.
export default async function ScorecardPage() {
  await requireOwner();
  const s = await buildScorecard(getStore());
  const weekFrom = addDays(s.asOf, -6);
  const gain = s.error.improvementPct;
  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <h1 className="text-2xl font-bold">Weekly scorecard</h1>
        <p className="text-sm text-ink-2">The 7 days from {niceDate(weekFrom)} to {niceDate(s.asOf)}</p>
      </div>

      <Glass dots delay={1} className="p-5">
        <DotLabel>Out of stock</DotLabel>
        <div className="mt-3 flex items-baseline gap-2"><DotNumber size={72}>{s.stockouts.itemDays}</DotNumber><span className="text-lg font-semibold">item-days</span></div>
        <p className="mt-2 text-sm text-ink-2">
          {s.stockouts.possibleItemDays
            ? `${s.stockouts.itemDays} of ${s.stockouts.possibleItemDays} (${s.stockouts.ratePct.toFixed(1)}%) on your top ${s.stockouts.topItems} items. Week before: ${s.stockouts.lastWeekItemDays}.`
            : "No sales yet, so there is nothing to measure."}
        </p>
        <Met ok={s.stockouts.possibleItemDays > 0 && s.stockouts.ratePct < 4}>Target: under 4%</Met>
        <p className="mt-1 text-xs text-ink-2">An item-day is one item with no stock at the end of one day. Worked out from today&apos;s stock, sales and deliveries.</p>
      </Glass>

      <Glass blur={false} delay={2} className="p-5">
        <DotLabel>Forecast error</DotLabel>
        <div className="mt-3 flex items-baseline gap-2">
          <DotNumber size={64}>{gain === null ? "–" : `${Math.round(Math.abs(gain))}%`}</DotNumber>
          <span className="text-lg font-semibold">{gain !== null && gain < 0 ? "higher" : "lower"}</span>
        </div>
        <p className="mt-2 text-sm text-ink-2">
          {s.error.items
            ? `The blended forecast missed ${s.error.blendError.toFixed(2)} units per item per day. The plain 28-day average missed ${s.error.simpleError.toFixed(2)}. Tested on ${s.error.items} items.`
            : "Not enough sales history yet. Items need 14 days of sales."}
        </p>
        <Met ok={gain !== null && gain >= 10}>Target: at least 10% lower</Met>
        <p className="mt-1 text-xs text-ink-2">Each day&apos;s forecast uses only the days before it, so the test is fair to the plain average.</p>
      </Glass>

      <Glass blur={false} delay={3} className="p-5">
        <DotLabel>Cash in slow stock</DotLabel>
        <div className="mt-3 flex items-baseline gap-1"><span className="text-3xl font-bold">₹</span><DotNumber size={56}>{s.slow.value.toLocaleString("en-IN")}</DotNumber></div>
        <p className="mt-2 text-sm text-ink-2">{s.slow.items} item(s) on the Don&apos;t reorder list, valued at selling price.</p>
        <p className="mt-2 text-sm font-semibold">Target: 25% lower in 6 months</p>
        <p className="mt-1 text-xs text-ink-2">Note this week&apos;s number now. In 6 months it should be a quarter lower.</p>
      </Glass>

      <Glass blur={false} delay={4} className="p-5">
        <DotLabel>Time to prepare an order</DotLabel>
        <div className="mt-3"><DotNumber size={48}>{s.prep.averageSeconds === null ? "–" : formatPrepTime(s.prep.averageSeconds)}</DotNumber></div>
        <p className="mt-2 text-sm text-ink-2">
          {s.prep.averageSeconds === null ? "No timed orders in the last 7 days. The timer runs on the Reorder screen." : `Average of ${s.prep.orders} order(s) in the last 7 days, from opening the list to tapping Share.`}
        </p>
        <Met ok={s.prep.averageSeconds !== null && s.prep.averageSeconds < 300}>Target: under 5 minutes</Met>
      </Glass>
    </div>
  );
}
