import Link from "next/link";
import { getStore } from "@/lib/data";
import { computeShopDesk } from "@/lib/desk-service";
import { niceDate, niceDay } from "@/lib/dates";
import { addDays } from "@/lib/forecast/desk";
import { SAMPLE_MIN_SALES } from "@/lib/business-day";
import { Badge } from "@/components/ui/Badge";
import BusinessDayControls from "@/components/BusinessDayControls";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import DotIcon from "@/components/ui/DotIcon";
import { DotLabel, DotNumber } from "@/components/ui/DotText";
import { requireOwner } from "@/lib/auth";
import { cookies } from "next/headers";
import HowItWorks from "@/components/HowItWorks";
import { HOW_IT_WORKS_COOKIE, SCREEN_HELP } from "@/lib/screen-help";

export const dynamic = "force-dynamic";

export default async function Home() {
  const me = await requireOwner(); // BR7: a helper only sees the Sell screen
  const store = getStore();
  const [shop, desk, day] = await Promise.all([store.getShop(), computeShopDesk(store), store.getBusinessDay()]);
  const results = [...desk.results.values()];
  const reorder = results.filter((r) => r.decision.status === "Reorder today").length;
  const dont = results.filter((r) => r.decision.status === "Don't reorder").length;
  const lowConf = results.filter((r) => r.decision.status === "Reorder today" && r.confidence === "Low").length;
  // The "How StockSaathi works" card shows until the owner closes it (a cookie on this phone remembers).
  const showHowTo = (await cookies()).get(HOW_IT_WORKS_COOKIE)?.value !== "1";
  // "Close the day" is for the owner on the product team. The cards below slide in one step later for each extra card.
  const showClose = me.isTeam;
  const d = (n: number) => n + (showHowTo ? 1 : 0) + (showClose ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <h1 className="text-2xl font-bold leading-tight">{shop.name}</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span>Shop date: {niceDay(desk.businessDate)}</span>
          {desk.simulated && <Badge>Simulated date</Badge>}
        </p>
        {desk.simulated && <p className="text-xs text-ink-2">Real date: {niceDay(desk.realDate)}</p>}
        <p className="text-sm text-ink-2">{SCREEN_HELP.home}</p>
        <p className="text-xs text-ink-2">{shop.locality} · forecast uses sales up to {niceDate(desk.asOf)}</p>
      </div>

      {showClose && (
        <BusinessDayControls
          today={niceDay(desk.businessDate)} next={niceDay(addDays(desk.businessDate, 1))} simulated={desk.simulated}
          canFill={day.sampleShop && day.salesToday < SAMPLE_MIN_SALES} salesToday={day.salesToday} delay={1}
        />
      )}

      {showHowTo && <HowItWorks delay={showClose ? 2 : 1} />}

      <Glass as={Link} href="/reorder" dots delay={d(1)} className="press block p-5">
        <DotLabel>Reorder today</DotLabel>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <DotNumber size={84}>{reorder}</DotNumber>
            <span className="text-lg font-semibold">items</span>
          </div>
          <DotIcon name="next" size={30} />
        </div>
        <p className="mt-3 text-sm text-ink-2">Tap to see quantities and share orders on WhatsApp</p>
      </Glass>

      <div className="grid grid-cols-2 gap-3">
        <Glass as={Link} href="/reorder#dont" blur={false} delay={d(2)} className="press block p-4">
          <DotLabel>Don&apos;t reorder</DotLabel>
          <div className="mt-2"><DotNumber size={48}>{dont}</DotNumber></div>
          <p className="mt-1 text-xs text-ink-2">slow or overstocked</p>
        </Glass>
        <Glass blur={false} delay={d(3)} className="p-4">
          <DotLabel>Sold today</DotLabel>
          <div className="mt-2"><DotNumber size={48}>{desk.todaySales.units}</DotNumber></div>
          <p className="mt-1 text-xs text-ink-2">units · ₹{desk.todaySales.value.toLocaleString("en-IN")}</p>
        </Glass>
      </div>

      {lowConf > 0 && (
        <Glass blur={false} alert delay={d(4)} role="alert" className="flex items-start gap-3 p-4">
          <span className="mt-0.5"><DotIcon name="alert" size={24} /></span>
          <p className="text-sm font-semibold">{lowConf} reorder item(s) have low confidence. Check them before sharing.</p>
        </Glass>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Glass as={Link} href="/deliveries" blur={false} delay={d(5)} className="press block p-4">
          <DotLabel>Deliveries</DotLabel>
          <p className="mt-2 text-sm"><span className="text-2xl font-bold">{Object.keys(desk.onOrder).length}</span> item(s) on order</p>
        </Glass>
        <Glass as={Link} href="/scorecard" blur={false} delay={d(5)} className="press block p-4">
          <DotLabel>Scorecard</DotLabel>
          <p className="mt-2 text-sm">See how this week went</p>
        </Glass>
      </div>

      <div className="rise" style={{ "--d": d(6) } as React.CSSProperties}>
        <Button href="/sell" icon="sell" full>Record a sale</Button>
      </div>
    </div>
  );
}
