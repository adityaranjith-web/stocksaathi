import Link from "next/link";
import { getStore } from "@/lib/data";
import { computeShopDesk } from "@/lib/desk-service";
import { niceDate } from "@/lib/dates";
import ReorderList, { type Group } from "@/components/ReorderList";
import Glass from "@/components/ui/Glass";
import DotIcon from "@/components/ui/DotIcon";
import { DotLabel } from "@/components/ui/DotText";
import { requireOwner } from "@/lib/auth";
import { SCREEN_HELP } from "@/lib/screen-help";

export const dynamic = "force-dynamic";

export default async function ReorderPage() {
  await requireOwner();
  const store = getStore();
  const [shop, desk] = await Promise.all([store.getShop(), computeShopDesk(store)]);
  const byId = new Map(desk.items.map((i) => [i.id, i]));
  const groups: Group[] = desk.distributors
    .map((d) => ({
      distributor: { id: d.id, name: d.name, salesman: d.salesman, whatsapp: d.whatsapp },
      lines: [...desk.results.values()]
        .filter((r) => r.decision.status === "Reorder today" && byId.get(r.itemId)?.distributorId === d.id)
        .map((r) => {
          const it = byId.get(r.itemId)!;
          return { itemId: it.id, name: it.name, pack: it.pack, stock: it.currentStock, suggested: r.decision.orderQty, confidence: r.confidence, perDay: r.forecast };
        }),
    }))
    .filter((g) => g.lines.length);
  const dont = [...desk.results.values()].filter((r) => r.decision.status === "Don't reorder");

  return (
    <div className="space-y-5">
      <div className="rise">
        <h1 className="text-2xl font-bold">Reorder today</h1>
        <p className="text-sm text-ink-2">{SCREEN_HELP.reorder}</p>
        <p className="text-xs text-ink-2">Based on sales up to {niceDate(desk.asOf)}.</p>
      </div>
      {groups.length ? <ReorderList groups={groups} shopName={shop.name} /> : <Glass blur={false} className="p-4">Nothing to reorder today.</Glass>}

      <section id="dont" className="scroll-mt-4">
        <h2 className="mb-2 px-1"><DotLabel>Don&apos;t reorder</DotLabel></h2>
        <Glass blur={false} className="divide-y divide-line overflow-hidden">
          {dont.length === 0 && <p className="p-4 text-sm">No slow or overstocked items.</p>}
          {dont.map((r) => {
            const it = byId.get(r.itemId)!;
            return (
              <Link key={r.itemId} href={`/item/${r.itemId}`} className="flex min-h-[56px] items-center justify-between gap-3 p-4">
                <span>
                  <span className="block font-semibold">{it.name} <span className="text-sm font-normal text-ink-2">· {it.currentStock} in stock</span></span>
                  <span className="block text-sm text-ink-2">{r.decision.reason}</span>
                </span>
                <DotIcon name="next" size={20} />
              </Link>
            );
          })}
        </Glass>
      </section>
    </div>
  );
}
