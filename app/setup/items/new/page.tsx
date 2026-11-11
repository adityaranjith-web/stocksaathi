import Link from "next/link";
import { getStore } from "@/lib/data";
import { requireOwner } from "@/lib/auth";
import ItemForm from "@/components/ItemForm";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import DotIcon from "@/components/ui/DotIcon";

export const dynamic = "force-dynamic";

export default async function NewItemPage() {
  await requireOwner();
  const distributors = await getStore().listDistributors();
  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <Link href="/setup/items" className="inline-flex min-h-[48px] items-center gap-1 text-sm font-semibold"><DotIcon name="back" size={20} />Items</Link>
        <h1 className="text-2xl font-bold">Add an item</h1>
      </div>
      {distributors.length ? (
        <ItemForm distributors={distributors.map((d) => ({ id: d.id, name: d.name }))} />
      ) : (
        <Glass blur={false} className="space-y-3 p-4">
          <p className="text-sm">Add a distributor first. Every item is ordered from one distributor.</p>
          <Button href="/setup/distributors/new" icon="plus" full>Add a distributor</Button>
        </Glass>
      )}
    </div>
  );
}
