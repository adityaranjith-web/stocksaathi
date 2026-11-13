import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { MORE_HELP, SCREEN_HELP } from "@/lib/screen-help";
import { buildVersion } from "@/lib/build-info";
import { getAiMode } from "@/lib/forecast/ai/registry";
import Glass from "@/components/ui/Glass";
import DotIcon, { type DotIconName } from "@/components/ui/DotIcon";
import { DotLabel } from "@/components/ui/DotText";

export const dynamic = "force-dynamic";

type Entry = { href: string; icon: DotIconName; title: string; text: string };

export default async function MorePage() {
  const me = await requireOwner();
  const reports: Entry[] = [
    { href: "/scorecard", icon: "chart", title: "Weekly scorecard", text: MORE_HELP["/scorecard"] },
    { href: "/stock", icon: "stock", title: "Stock", text: MORE_HELP["/stock"] },
  ];
  const setup: Entry[] = [
    { href: "/setup/items", icon: "edit", title: "Items", text: MORE_HELP["/setup/items"] },
    { href: "/setup/distributors", icon: "deliver", title: "Distributors", text: MORE_HELP["/setup/distributors"] },
    { href: "/setup/helpers", icon: "people", title: "Helpers", text: MORE_HELP["/setup/helpers"] },
  ];
  if (me.isTeam) setup.push({ href: "/setup/calendar", icon: "calendar", title: "Festival calendar", text: MORE_HELP["/setup/calendar"] });
  const privacy: Entry[] = [
    { href: "/setup/account", icon: "alert", title: "Your account", text: MORE_HELP["/setup/account"] },
    { href: "/privacy", icon: "check", title: "Privacy policy", text: MORE_HELP["/privacy"] },
    { href: "/terms", icon: "edit", title: "Terms of service", text: MORE_HELP["/terms"] },
  ];
  const extra: Entry[] = [{ href: "/ai", icon: "ai", title: "AI forecasts", text: getAiMode() === "off" ? MORE_HELP["/ai#off"] : MORE_HELP["/ai"] }];

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
      <div className="rise px-1">
        <h1 className="text-2xl font-bold">More</h1>
        <p className="text-sm text-ink-2">{SCREEN_HELP.more}</p>
      </div>
      {group("Reports", reports, 1)}
      {group("Set-up", setup, 2)}
      {group("Coming next", extra, 3)}
      {group("Privacy", privacy, 4)}
      <p className="px-1 text-xs text-ink-2" data-testid="who-and-version">
        Signed in as {me.name} ({me.role === "owner" ? "owner" : "helper"}{me.isTeam ? ", product team" : ""}).{buildVersion() ? ` Version ${buildVersion()}.` : ""}
      </p>
    </div>
  );
}
