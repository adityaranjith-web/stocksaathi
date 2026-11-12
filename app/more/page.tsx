import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { getAiMode } from "@/lib/forecast/ai/registry";
import Glass from "@/components/ui/Glass";
import DotIcon, { type DotIconName } from "@/components/ui/DotIcon";
import { DotLabel } from "@/components/ui/DotText";

export const dynamic = "force-dynamic";

type Entry = { href: string; icon: DotIconName; title: string; text: string };

export default async function MorePage() {
  const me = await requireOwner();
  const reports: Entry[] = [
    { href: "/scorecard", icon: "chart", title: "Weekly scorecard", text: "Out-of-stock days, forecast error, cash in slow stock, order time" },
    { href: "/stock", icon: "stock", title: "Stock", text: "All items, days left, and upload past sales" },
  ];
  const setup: Entry[] = [
    { href: "/setup/items", icon: "edit", title: "Items", text: "Add or change items, prices and lead times" },
    { href: "/setup/distributors", icon: "deliver", title: "Distributors", text: "Add or change distributors and WhatsApp numbers" },
    { href: "/setup/helpers", icon: "people", title: "Helpers", text: "Let someone record sales with their Google account" },
  ];
  if (me.isTeam) setup.push({ href: "/setup/calendar", icon: "calendar", title: "Festival calendar", text: "Product team: mark festival and holiday dates" });
  const privacy: Entry[] = [{ href: "/setup/account", icon: "alert", title: "Your account", text: "Sign out, or delete your account and all shop data" }];
  const extra: Entry[] = [{ href: "/ai", icon: "ai", title: "AI forecasts", text: getAiMode() === "off" ? "Switched off. See how to turn it on" : "Second opinion from an AI model" }];

  const group = (label: string, rows: Entry[], d: number) => (
    <section>
      <h2 className="mb-2 px-1"><DotLabel>{label}</DotLabel></h2>
      <Glass blur={false} delay={d} className="divide-y divide-line overflow-hidden">
        {rows.map((r) => (
          <Link key={r.href} href={r.href} className="flex min-h-[64px] items-center gap-3 p-4">
            <DotIcon name={r.icon} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{r.title}</span>
              <span className="block text-sm text-ink-2">{r.text}</span>
            </span>
            <DotIcon name="next" size={20} />
          </Link>
        ))}
      </Glass>
    </section>
  );

  return (
    <div className="space-y-5">
      <h1 className="rise px-1 text-2xl font-bold">More</h1>
      {group("Reports", reports, 1)}
      {group("Set-up", setup, 2)}
      {group("Coming next", extra, 3)}
      {group("Privacy", privacy, 4)}
    </div>
  );
}
