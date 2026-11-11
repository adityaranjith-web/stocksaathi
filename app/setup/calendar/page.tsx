import Link from "next/link";
import { getStore } from "@/lib/data";
import { requireTeam } from "@/lib/auth";
import { todayIST } from "@/lib/dates";
import CalendarManager from "@/components/CalendarManager";
import DotIcon from "@/components/ui/DotIcon";

export const dynamic = "force-dynamic";

// FR8: product team only.
export default async function CalendarPage() {
  await requireTeam();
  const days = await getStore().listCalendar();
  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <Link href="/more" className="inline-flex min-h-[48px] items-center gap-1 text-sm font-semibold"><DotIcon name="back" size={20} />More</Link>
        <h1 className="text-2xl font-bold">Festival calendar</h1>
        <p className="text-sm text-ink-2">Mark festival and holiday dates. A marked date changes that week&apos;s forecast for every shop.</p>
      </div>
      <CalendarManager days={days} today={todayIST()} />
    </div>
  );
}
