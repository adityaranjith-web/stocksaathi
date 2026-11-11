import Link from "next/link";
import { getStore } from "@/lib/data";
import { requireOwner } from "@/lib/auth";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import DotIcon from "@/components/ui/DotIcon";

export const dynamic = "force-dynamic";

export default async function DistributorsPage() {
  await requireOwner();
  const distributors = await getStore().listDistributors();
  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <Link href="/more" className="inline-flex min-h-[48px] items-center gap-1 text-sm font-semibold"><DotIcon name="back" size={20} />More</Link>
        <h1 className="text-2xl font-bold">Distributors</h1>
        <p className="text-sm text-ink-2">Orders are sent to the WhatsApp number saved here.</p>
      </div>
      <Button href="/setup/distributors/new" icon="plus" full>Add a distributor</Button>
      <Glass blur={false} className="divide-y divide-line overflow-hidden">
        {distributors.length === 0 && <p className="p-4 text-sm">No distributors yet.</p>}
        {distributors.map((d) => (
          <Link key={d.id} href={`/setup/distributors/${d.id}`} className="flex min-h-[64px] items-center justify-between gap-3 p-4">
            <span className="min-w-0">
              <span className="block font-semibold">{d.name}</span>
              <span className="block text-sm text-ink-2">{d.salesman || "No salesman"}{d.visitDay ? ` · visits ${d.visitDay}` : ""}</span>
            </span>
            <DotIcon name="edit" size={20} />
          </Link>
        ))}
      </Glass>
    </div>
  );
}
