import Link from "next/link";
import { getStore } from "@/lib/data";
import { requireOwner } from "@/lib/auth";
import { computeShopDesk } from "@/lib/desk-service";
import { addDays } from "@/lib/forecast/desk";
import { getAiMode, getForecaster } from "@/lib/forecast/ai/registry";
import { evaluateShadow, PROMOTION_RULES, shouldPromote } from "@/lib/forecast/ai/evaluate";
import { niceDate } from "@/lib/dates";
import AiRunButton from "@/components/AiRunButton";
import Glass from "@/components/ui/Glass";
import DotIcon from "@/components/ui/DotIcon";
import { Badge } from "@/components/ui/Badge";
import { DotLabel, DotNumber } from "@/components/ui/DotText";

export const dynamic = "force-dynamic";

const MODE_TEXT = {
  off: "Off",
  shadow: "Checking only. Orders do not change.",
  blend: "On. A proven AI model is mixed into orders.",
};

// Future AI integration: shows the state of the plug-in system. See docs/ai-integration.md.
export default async function AiPage() {
  await requireOwner();
  const mode = getAiMode();
  const forecaster = getForecaster();
  const store = getStore();

  let ev = null, verdict = null, lastRun: string | null = null;
  if (forecaster) {
    const desk = await computeShopDesk(store, { useAi: false });
    const rows = (await store.listAiForecasts(addDays(desk.asOf, -55))).filter((r) => r.provider === forecaster.id);
    ev = evaluateShadow(rows, desk.sales, desk.asOf);
    verdict = shouldPromote(ev);
    lastRun = rows.reduce<string | null>((m, r) => (m === null || r.runDate > m ? r.runDate : m), null);
  }

  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <Link href="/more" className="inline-flex min-h-[48px] items-center gap-1 text-sm font-semibold"><DotIcon name="back" size={20} />More</Link>
        <h1 className="text-2xl font-bold">AI forecasts</h1>
        <p className="text-sm text-ink-2">A second opinion that is checked against real sales before it is ever used.</p>
      </div>

      <Glass dots delay={1} className="space-y-2 p-5">
        <DotLabel>Status</DotLabel>
        <p className="text-xl font-bold">{MODE_TEXT[mode]}</p>
        {forecaster ? <Badge>{forecaster.name}</Badge> : mode !== "off" && <Badge tone="alert">AI is not set up correctly</Badge>}
        {mode === "off" && (
          <p className="pt-1 text-sm text-ink-2">
            Nothing is sent anywhere. To try it, set <b>AI_MODE=shadow</b> and <b>AI_FORECASTER=mock</b> in the server settings (Vercel → Settings → Environment Variables), then redeploy.
            The steps for a real AI (Google Gemini has a free plan) are in <b>docs/ai-integration.md</b>.
          </p>
        )}
        {mode !== "off" && !forecaster && (
          <p className="pt-1 text-sm text-ink-2">The AI is switched on but not set up fully. Check AI_FORECASTER and, for Gemini, AI_FORECAST_KEY in the server settings. Orders are not affected: they use the Forecast Desk.</p>
        )}
      </Glass>

      {forecaster && ev && verdict && (
        <>
          <Glass blur={false} delay={2} className="space-y-3 p-5">
            <DotLabel>Run a forecast</DotLabel>
            <p className="text-sm text-ink-2">{lastRun ? `Last run: ${niceDate(lastRun)}.` : "Not run yet."} Each run sends item names and daily unit sales only. No shop, owner, helper or supplier details leave the app.</p>
            <AiRunButton />
          </Glass>

          <Glass blur={false} delay={3} className="space-y-2 p-5">
            <DotLabel>How good is it?</DotLabel>
            <div className="flex items-baseline gap-2">
              <DotNumber size={56}>{ev.improvementPct === null ? "–" : `${Math.round(Math.abs(ev.improvementPct))}%`}</DotNumber>
              <span className="text-lg font-semibold">{ev.improvementPct !== null && ev.improvementPct < 0 ? "worse" : "better"} than the Forecast Desk</span>
            </div>
            <p className="text-sm text-ink-2">
              {ev.rows ? `The AI missed ${ev.aiError.toFixed(2)} units per day. The Forecast Desk missed ${ev.blendError.toFixed(2)}. Checked ${ev.rows} forecasts from ${ev.runDays} day(s).` : "No forecast can be checked yet. A forecast is checked once all its days have passed."}
            </p>
            <p className="flex items-start gap-2 text-sm font-semibold">
              <DotIcon name={verdict.promote ? "check" : "alert"} size={18} />
              {verdict.promote ? "Passed. " : "Not yet. "}{verdict.reason}
            </p>
            <p className="text-xs text-ink-2">
              Rules: at least {PROMOTION_RULES.minRunDays} days, {PROMOTION_RULES.minRows} checked forecasts, and {PROMOTION_RULES.minGainPct}% fewer missed units.
              Even then it is used only when AI_MODE is set to <b>blend</b>, and it never gets more than 40% of the forecast.
            </p>
          </Glass>
        </>
      )}
    </div>
  );
}
