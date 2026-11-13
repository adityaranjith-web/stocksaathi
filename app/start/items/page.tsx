import Link from "next/link";
import { getStore } from "@/lib/data";
import { requireOwner } from "@/lib/auth";
import StartItemsForm from "@/components/StartItemsForm";
import DotIcon from "@/components/ui/DotIcon";
import { START_COPY, STARTER_ITEMS } from "@/lib/start-shop";

export const dynamic = "force-dynamic";

// "Start your shop", step 1 (owner only).
export default async function StartItemsPage() {
  await requireOwner();
  const items = await getStore().listItems();
  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <Link href="/" className="inline-flex min-h-[48px] items-center gap-1 text-sm font-semibold"><DotIcon name="back" size={20} />Home</Link>
        <h1 className="text-2xl font-bold">Step 1: {START_COPY.items.title}</h1>
        <p className="text-sm text-ink-2">{START_COPY.items.help}</p>
      </div>
      <StartItemsForm starter={STARTER_ITEMS} existing={items.map((i) => i.name)} />
    </div>
  );
}
