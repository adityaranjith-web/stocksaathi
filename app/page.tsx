import Link from "next/link";
import { getStore } from "@/lib/data";
import { computeShopDesk } from "@/lib/desk-service";
import { niceDate } from "@/lib/dates";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import DotIcon from "@/components/ui/DotIcon";
import { DotLabel, DotNumber } from "@/components/ui/DotText";
import { requireOwner } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireOwner(); // BR7: a helper only sees the Sell screen
  const store = getStore();
  const [shop, desk] = await Promise.all([store.getShop(), computeShopDesk(store)]);
  const results = [...desk.results.values()];
  const reorder = results.filter((r) => r.decision.status === "Reorder today").length;
  const dont = results.filter((r) => r.decision.status === "Don't reorder").length;
  const lowConf = results.filter((r) => r.decision.status === "Reorder today" && r.confidence === "Low").length;

  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <h1 className="text-2xl font-bold leading-tight">{shop.name}</h1>
        <p className="text-sm text-ink-2">{shop.locality} · forecast uses sales up to {niceDate(desk.asOf)}</p>
      </div>

      <Glass as={Link} href="/reorder" dots delay={1} className="press block p-5">
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
        <Glass as={Link} href="/reorder#dont" blur={false} delay={2} className="press block p-4">
          <DotLabel>Don&apos;t reorder</DotLabel>
          <div className="mt-2"><DotNumber size={48}>{dont}</DotNumber></div>
          <p className="mt-1 text-xs text-ink-2">slow or overstocked</p>
        </Glass>
        <Glass blur={false} delay={3} className="p-4">
          <DotLabel>Sold today</DotLabel>
          <div className="mt-2"><DotNumber size={48}>{desk.todaySales.units}</DotNumber></div>
          <p className="mt-1 text-xs text-ink-2">units · ₹{desk.todaySales.value.toLocaleString("en-IN")}</p>
        </Glass>
      </div>

      {lowConf > 0 && (
        <Glass blur={false} alert delay={4} role="alert" className="flex items-start gap-3 p-4">
          <span className="mt-0.5"><DotIcon name="alert" size={24} /></span>
          <p className="text-sm font-semibold">{lowConf} reorder item(s) have low confidence. Check them before sharing.</p>
        </Glass>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Glass as={Link} href="/deliveries" blur={false} delay={5} className="press block p-4">
          <DotLabel>Deliveries</DotLabel>
          <p className="mt-2 text-sm"><span className="text-2xl font-bold">{Object.keys(desk.onOrder).length}</span> item(s) on order</p>
        </Glass>
        <Glass as={Link} href="/scorecard" blur={false} delay={5} className="press block p-4">
          <DotLabel>Scorecard</DotLabel>
          <p className="mt-2 text-sm">See how this week went</p>
        </Glass>
      </div>

      <div className="rise" style={{ "--d": 6 } as React.CSSProperties}>
        <Button href="/sell" icon="sell" full>Record a sale</Button>
      </div>
    </div>
  );
}
