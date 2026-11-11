import Link from "next/link";
import { getStore } from "@/lib/data";
import { requireOwner } from "@/lib/auth";
import HelpersManager from "@/components/HelpersManager";
import DotIcon from "@/components/ui/DotIcon";

export const dynamic = "force-dynamic";

export default async function HelpersPage() {
  await requireOwner();
  const helpers = await getStore().listHelpers();
  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <Link href="/more" className="inline-flex min-h-[48px] items-center gap-1 text-sm font-semibold"><DotIcon name="back" size={20} />More</Link>
        <h1 className="text-2xl font-bold">Helpers</h1>
        <p className="text-sm text-ink-2">A helper can only record sales. They cannot see stock, prices or orders.</p>
      </div>
      <HelpersManager helpers={helpers} />
    </div>
  );
}
