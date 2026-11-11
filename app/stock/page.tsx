import Link from "next/link";
import { getStore } from "@/lib/data";
import { computeShopDesk } from "@/lib/desk-service";
import { requireOwner } from "@/lib/auth";
import CsvUpload from "@/components/CsvUpload";
import Button from "@/components/ui/Button";
import Glass from "@/components/ui/Glass";
import DotIcon from "@/components/ui/DotIcon";
import { DotLabel } from "@/components/ui/DotText";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  await requireOwner();
  const desk = await computeShopDesk(getStore());
  const rows = desk.items.map((it) => ({ it, r: desk.results.get(it.id)! })).sort((a, b) => a.r.decision.coverDays - b.r.decision.coverDays);
  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <Link href="/more" className="inline-flex min-h-[48px] items-center gap-1 text-sm font-semibold"><DotIcon name="back" size={20} />More</Link>
        <h1 className="text-2xl font-bold">Stock</h1>
      </div>
      <Button href="/deliveries" variant="ghost" icon="deliver" full>Record a delivery</Button>
      <CsvUpload />
      <Glass as="section" blur={false} className="p-4">
        <h2 className="mb-2"><DotLabel>All items (lowest cover first)</DotLabel></h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-2"><th className="py-1 font-semibold">Item</th><th className="text-right font-semibold">Stock</th><th className="text-right font-semibold">Days left</th></tr></thead>
          <tbody>
            {rows.map(({ it, r }) => {
              const reorder = r.decision.status === "Reorder today";
              return (
                <tr key={it.id} className="border-t border-line">
                  <td><Link href={`/item/${it.id}`} className="flex min-h-[44px] items-center font-medium">{it.name}</Link></td>
                  <td className="text-right tabular-nums">{it.currentStock}</td>
                  <td className={`text-right font-semibold tabular-nums ${reorder ? "text-alert" : r.decision.status === "Don't reorder" ? "text-ink-2" : ""}`}>
                    <span className="inline-flex items-center justify-end gap-1">
                      {reorder && <DotIcon name="alert" size={14} label="Reorder today" />}
                      {Number.isFinite(r.decision.coverDays) ? r.decision.coverDays.toFixed(0) : "–"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Glass>
    </div>
  );
}
