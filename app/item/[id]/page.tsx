import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/data";
import { computeShopDesk } from "@/lib/desk-service";
import { MODEL_NAMES, addDays } from "@/lib/forecast/desk";
import { getForecaster } from "@/lib/forecast/ai/registry";
import { asOfDay, niceDate } from "@/lib/dates";
import Glass from "@/components/ui/Glass";
import DotIcon from "@/components/ui/DotIcon";
import DotMeter from "@/components/ui/DotMeter";
import { ConfidenceBadge } from "@/components/ui/Badge";
import { DotLabel, DotNumber } from "@/components/ui/DotText";
import { requireOwner } from "@/lib/auth";

export const dynamic = "force-dynamic";

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "–");

export default async function WhyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const store = getStore();
  // The AI second opinion is read in the same step as the rest (one round of database calls, never one after another).
  // With AI off nothing extra is read. Any problem reading it just hides that box: the page never shows an AI error.
  const forecaster = getForecaster();
  const [desk, aiRows] = await Promise.all([
    computeShopDesk(store),
    forecaster ? store.listAiForecasts(addDays(asOfDay(), -7)).catch(() => []) : Promise.resolve([]),
  ]);
  const ai = forecaster ? aiRows.filter((a) => a.provider === forecaster.id && a.itemId === id).sort((a, b) => b.runDate.localeCompare(a.runDate))[0] : undefined;
  const r = desk.results.get(id);
  const it = desk.items.find((i) => i.id === id);
  if (!r || !it) notFound();
  const d = r.decision;
  const onOrder = desk.onOrder[id] ?? 0;

  return (
    <div className="space-y-4">
      <Link href="/reorder" className="rise inline-flex min-h-[48px] items-center gap-1 text-sm font-semibold"><DotIcon name="back" size={20} />Back to reorder list</Link>
      <div className="rise px-1" style={{ "--d": 1 } as React.CSSProperties}>
        <h1 className="text-2xl font-bold leading-tight">Why this number: {it.name}</h1>
        <p className="text-sm text-ink-2">Sales up to {niceDate(desk.asOf)} · lead time {it.leadTimeDays} day(s) · order cover {it.orderCoverDays} day(s)</p>
      </div>

      <Glass dots delay={2} className="p-5">
        <DotLabel>{d.status}</DotLabel>
        <div className="mt-3">
          {d.status === "Reorder today" ? (
            <p className="flex items-baseline gap-3"><span className="text-2xl font-bold">Order</span><DotNumber size={72}>{d.orderQty}</DotNumber></p>
          ) : (
            <p className="text-3xl font-bold leading-tight">{d.status === "OK" ? "No order needed" : "Do not reorder"}</p>
          )}
        </div>
        <p className="mb-2 mt-3 text-sm text-ink-2">{d.reason}</p>
        <ConfidenceBadge level={r.confidence} />
      </Glass>

      <Glass blur={false} delay={3} className="p-4">
        <h2 className="mb-2"><DotLabel>What each model says (units per day)</DotLabel></h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-2"><th className="py-1 font-semibold">Model</th><th className="pl-3 text-right font-semibold">Forecast</th><th className="pl-3 text-right font-semibold">Miss</th><th className="pl-3 text-right font-semibold">Weight</th></tr></thead>
          <tbody>
            {r.members.map((m) => (
              <tr key={m.model} className="border-t border-line">
                <td className="py-2">{m.model} {MODEL_NAMES[m.model]}</td>
                <td className="pl-3 text-right tabular-nums">{m.forecast.toFixed(2)}</td>
                <td className="pl-3 text-right tabular-nums">{m.mae.toFixed(2)}</td>
                <td className="pl-3 text-right font-semibold tabular-nums">{(m.weight * 100).toFixed(1)}%<DotMeter value={m.weight / 0.6} className="ml-auto mt-0.5 block" /></td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink font-bold"><td className="py-2">Blended forecast</td><td className="text-right tabular-nums">{r.forecast.toFixed(2)}</td><td /><td className="text-right">100%</td></tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink-2">Miss = average units missed per day over the last 14 days. A smaller miss gives a bigger weight (5% to 60%).</p>
      </Glass>

      {ai && (
        <Glass blur={false} delay={4} className="space-y-2 p-4 text-sm">
          <h2><DotLabel>AI second opinion</DotLabel></h2>
          <p className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">{ai.aiUnitsPerDay.toFixed(1)}</span>
            <span>units per day{ai.low !== null && ai.high !== null ? ` (between ${ai.low.toFixed(1)} and ${ai.high.toFixed(1)})` : ""}</span>
          </p>
          <p className="text-ink-2">The Forecast Desk said {ai.blendUnitsPerDay.toFixed(1)} units per day when the AI was asked on {niceDate(ai.runDate)}.</p>
          <p className="font-semibold">
            {r.notes.some((n) => n.includes("AI second opinion mixed in"))
              ? "The AI has passed the checks, so it is mixed into this order."
              : "For checking only. It does not change your order."}
          </p>
        </Glass>
      )}

      {r.notes.length > 0 && (
        <Glass blur={false} delay={5} className="p-4">
          <ul className="space-y-2 text-sm">
            {r.notes.map((n) => {
              // Only the "please check" note is an alert (red). The others are plain information.
              const warn = n.includes("please check");
              return (
                <li key={n} role={warn ? "alert" : undefined} className={`flex items-start gap-2 ${warn ? "font-semibold text-alert" : ""}`}>
                  <span className="mt-0.5 shrink-0"><DotIcon name={warn ? "alert" : "check"} size={18} /></span>{n}
                </li>
              );
            })}
          </ul>
        </Glass>
      )}

      <Glass blur={false} delay={6} className="space-y-1 p-4 text-sm">
        <h2 className="mb-2"><DotLabel>The working</DotLabel></h2>
        <p>Spread between models = {f1(r.spread)} units/day</p>
        <p>Safety stock = larger of {it.minSafetyStock} and {f1(r.spread)} × {it.leadTimeDays} = {f1(d.safetyStock)}</p>
        <p>Reorder point = {r.forecast.toFixed(2)} × {it.leadTimeDays} + {f1(d.safetyStock)} = {f1(d.reorderPoint)}</p>
        <p>Stock {it.currentStock}{onOrder ? ` + ${onOrder} on order` : ""} · {f1(d.coverDays)} days of cover</p>
        {d.status === "Reorder today" && (
          <p className="pt-1 font-semibold">Order = {r.forecast.toFixed(2)} × ({it.leadTimeDays} + {it.orderCoverDays}) + {f1(d.safetyStock)} − {it.currentStock + onOrder} → {d.orderQty}</p>
        )}
      </Glass>
    </div>
  );
}
