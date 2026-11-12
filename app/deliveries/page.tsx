import { getStore } from "@/lib/data";
import { requireOwner } from "@/lib/auth";
import { SCREEN_HELP } from "@/lib/screen-help";
import DeliveriesForm, { type DeliveryGroup } from "@/components/DeliveriesForm";
import DeliveryForm from "@/components/DeliveryForm";
import Glass from "@/components/ui/Glass";

export const dynamic = "force-dynamic";

export default async function DeliveriesPage() {
  await requireOwner();
  const store = getStore();
  const [orders, items, distributors] = await Promise.all([store.openOrders(), store.listItems(), store.listDistributors()]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const distName = new Map(distributors.map((d) => [d.id, d.name]));
  const groups: DeliveryGroup[] = orders
    .map((o) => ({
      orderId: o.orderId, distributorName: distName.get(o.distributorId) ?? "Distributor", orderedOn: o.orderedOn,
      lines: o.lines.filter((l) => itemById.has(l.itemId)).map((l) => ({ itemId: l.itemId, name: itemById.get(l.itemId)!.name, pack: itemById.get(l.itemId)!.pack, ordered: l.qty, stock: itemById.get(l.itemId)!.currentStock })),
    }))
    .filter((g) => g.lines.length);
  // A fresh key makes the form start again with the new quantities after a save.
  const formKey = groups.map((g) => `${g.orderId}:${g.lines.map((l) => l.itemId).join(",")}`).join("|");

  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <h1 className="text-2xl font-bold">Deliveries</h1>
        <p className="text-sm text-ink-2">{SCREEN_HELP.deliveries}</p>
      </div>
      {groups.length ? (
        <DeliveriesForm key={formKey} groups={groups} />
      ) : (
        <Glass blur={false} className="p-4 text-sm">No open orders. Send an order from the Reorder screen first.</Glass>
      )}
      <DeliveryForm items={items.map((i) => ({ id: i.id, name: i.name, pack: i.pack }))} />
    </div>
  );
}
