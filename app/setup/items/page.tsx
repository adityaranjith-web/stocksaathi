import Link from "next/link";
import { getStore } from "@/lib/data";
import { requireOwner } from "@/lib/auth";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import DotIcon from "@/components/ui/DotIcon";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  await requireOwner();
  const store = getStore();
  const [items, distributors] = await Promise.all([store.listItems(), store.listDistributors()]);
  const dist = new Map(distributors.map((d) => [d.id, d.name]));
  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <Link href="/more" className="inline-flex min-h-[48px] items-center gap-1 text-sm font-semibold"><DotIcon name="back" size={20} />More</Link>
        <h1 className="text-2xl font-bold">Items</h1>
        <p className="text-sm text-ink-2">Tap an item to change its price, distributor or order settings.</p>
      </div>
      <Button href="/setup/items/new" icon="plus" full>Add an item</Button>
      <Glass blur={false} className="divide-y divide-line overflow-hidden">
        {items.length === 0 && <p className="p-4 text-sm">No items yet. Add your first item.</p>}
        {items.map((i) => (
          <Link key={i.id} href={`/setup/items/${i.id}`} className="flex min-h-[64px] items-center justify-between gap-3 p-4">
            <span className="min-w-0">
              <span className="block font-semibold">{i.name} <span className="text-sm font-normal text-ink-2">{i.pack}</span></span>
              <span className="block text-sm text-ink-2">₹{i.price} · {dist.get(i.distributorId) ?? "No distributor"} · arrives in {i.leadTimeDays} d</span>
            </span>
            <DotIcon name="edit" size={20} />
          </Link>
        ))}
      </Glass>
    </div>
  );
}
