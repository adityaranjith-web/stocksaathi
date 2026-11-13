import Link from "next/link";
import { getStore } from "@/lib/data";
import { requireOwner } from "@/lib/auth";
import { addDays } from "@/lib/forecast/desk";
import { asOfFor } from "@/lib/business-day";
import StartHistoryForm from "@/components/StartHistoryForm";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import DotIcon from "@/components/ui/DotIcon";
import { START_COPY } from "@/lib/start-shop";

export const dynamic = "force-dynamic";

const label = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", timeZone: "UTC" });

// "Start your shop", step 3 (owner only, optional): past sales for the last 7 complete days.
export default async function StartHistoryPage() {
  await requireOwner();
  const store = getStore();
  const [items, day] = await Promise.all([store.listItems(), store.getBusinessDay()]);
  const last = asOfFor(day.date);
  const days = Array.from({ length: 7 }, (_, k) => addDays(last, k - 6)).map((date) => ({ date, label: label(date) }));
  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <Link href="/" className="inline-flex min-h-[48px] items-center gap-1 text-sm font-semibold"><DotIcon name="back" size={20} />Home</Link>
        <h1 className="text-2xl font-bold">Step 3: {START_COPY.history.title}</h1>
        <p className="text-sm text-ink-2">{START_COPY.history.help}</p>
      </div>
      {items.length === 0 ? (
        <Glass blur={false} className="space-y-3 p-4 text-sm">
          <p>You have no items yet. Add items first.</p>
          <Button href="/start/items" icon="plus" full>Add items</Button>
        </Glass>
      ) : (
        <StartHistoryForm items={items.map((i) => ({ id: i.id, name: i.name }))} days={days} />
      )}
    </div>
  );
}
