import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import DistributorForm from "@/components/DistributorForm";
import DotIcon from "@/components/ui/DotIcon";

export const dynamic = "force-dynamic";

export default async function NewDistributorPage() {
  await requireOwner();
  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <Link href="/setup/distributors" className="inline-flex min-h-[48px] items-center gap-1 text-sm font-semibold"><DotIcon name="back" size={20} />Distributors</Link>
        <h1 className="text-2xl font-bold">Add a distributor</h1>
      </div>
      <DistributorForm />
    </div>
  );
}
