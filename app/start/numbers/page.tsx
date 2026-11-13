import Link from "next/link";
import { getStore } from "@/lib/data";
import { requireOwner } from "@/lib/auth";
import StartNumbersForm from "@/components/StartNumbersForm";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import DotIcon from "@/components/ui/DotIcon";
import { START_COPY } from "@/lib/start-shop";

export const dynamic = "force-dynamic";

// "Start your shop", step 2 (owner only): the items that have no "sells per day" estimate yet.
export default async function StartNumbersPage() {
  await requireOwner();
  const store = getStore();
  const [items, distributors] = await Promise.all([store.listItems(), store.listDistributors()]);
  const todo = items.filter((i) => i.estimatedPerDay === null || i.estimatedPerDay === undefined);
  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <Link href="/" className="inline-flex min-h-[48px] items-center gap-1 text-sm font-semibold"><DotIcon name="back" size={20} />Home</Link>
        <h1 className="text-2xl font-bold">Step 2: {START_COPY.numbers.title}</h1>
        <p className="text-sm text-ink-2">{START_COPY.numbers.help}</p>
      </div>
      {items.length === 0 ? (
        <Glass blur={false} className="space-y-3 p-4 text-sm">
          <p>You have no items yet. Add items first.</p>
          <Button href="/start/items" icon="plus" full>Add items</Button>
        </Glass>
      ) : todo.length === 0 ? (
        <Glass blur={false} className="space-y-3 p-4 text-sm">
          <p className="font-semibold">All your items have their numbers.</p>
          <Button href="/start/history" icon="next" full>Next: past sales</Button>
          <Button href="/" variant="ghost" full>Back to Home</Button>
        </Glass>
      ) : (
        <StartNumbersForm items={todo.map((i) => ({ id: i.id, name: i.name, pack: i.pack }))} distributors={distributors.map((d) => d.name)} />
      )}
    </div>
  );
}
