"use client";
import GlassNav, { type NavTab } from "@/components/ui/GlassNav";

const tabs: NavTab[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/sell", label: "Sell", icon: "sell" },
  { href: "/reorder", label: "Reorder", icon: "reorder" },
  { href: "/stock", label: "Stock", icon: "stock" },
];

export default function BottomNav() {
  return <GlassNav tabs={tabs} />;
}
