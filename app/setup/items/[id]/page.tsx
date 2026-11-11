import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/data";
import { requireOwner } from "@/lib/auth";
import ItemForm from "@/components/ItemForm";
import DotIcon from "@/components/ui/DotIcon";

export const dynamic = "force-dynamic";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const store = getStore();
  const [items, distributors] = await Promise.all([store.listItems(), store.listDistributors()]);
  const item = items.find((i) => i.id === id);
  if (!item) notFound();
  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <Link href="/setup/items" className="inline-flex min-h-[48px] items-center gap-1 text-sm font-semibold"><DotIcon name="back" size={20} />Items</Link>
        <h1 className="text-2xl font-bold">{item.name}</h1>
        <p className="text-sm text-ink-2">{item.currentStock} in stock now. Stock changes with sales and deliveries.</p>
      </div>
      <ItemForm
        distributors={distributors.map((d) => ({ id: d.id, name: d.name }))}
        item={{ id: item.id, name: item.name, category: item.category, pack: item.pack, price: item.price, distributorId: item.distributorId, leadTimeDays: item.leadTimeDays, minSafetyStock: item.minSafetyStock, orderCoverDays: item.orderCoverDays }}
      />
    </div>
  );
}
