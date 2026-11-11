import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/data";
import { requireOwner } from "@/lib/auth";
import DistributorForm from "@/components/DistributorForm";
import DotIcon from "@/components/ui/DotIcon";

export const dynamic = "force-dynamic";

export default async function EditDistributorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const d = (await getStore().listDistributors()).find((x) => x.id === id);
  if (!d) notFound();
  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <Link href="/setup/distributors" className="inline-flex min-h-[48px] items-center gap-1 text-sm font-semibold"><DotIcon name="back" size={20} />Distributors</Link>
        <h1 className="text-2xl font-bold">{d.name}</h1>
      </div>
      <DistributorForm distributor={d} />
    </div>
  );
}
