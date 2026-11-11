"use client";
import GlassNav, { type NavTab } from "@/components/ui/GlassNav";

// BR7: the owner sees everything. A helper sees only the Sell screen, so no navigation bar is shown.
const ownerTabs: NavTab[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/sell", label: "Sell", icon: "sell" },
  { href: "/reorder", label: "Reorder", icon: "reorder", match: ["/item"] },
  { href: "/deliveries", label: "Deliveries", icon: "deliver" },
  { href: "/more", label: "More", icon: "grid", match: ["/stock", "/scorecard", "/setup", "/ai"] },
];

export default function BottomNav({ role }: { role: "owner" | "helper" | null }) {
  return <GlassNav tabs={role === "owner" ? ownerTabs : []} />;
}
