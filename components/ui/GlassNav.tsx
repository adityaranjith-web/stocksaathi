"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DotIcon, { type DotIconName } from "./DotIcon";

export type NavTab = { href: string; label: string; icon: DotIconName };

// Floating glass bar at the bottom of the screen. A dark pill slides under the current tab.
// This is the only always-on blur layer in the app.
export default function GlassNav({ tabs }: { tabs: NavTab[] }) {
  const path = usePathname();
  if (path.startsWith("/login")) return null;
  const isActive = (t: NavTab) => (t.href === "/" ? path === "/" : path.startsWith(t.href));
  const found = tabs.findIndex(isActive);
  const index = found < 0 ? 0 : found;
  return (
    <div className="nav-wrap">
      <nav aria-label="Main" className="glass glass-blur nav-bar">
        <div className="nav-track" style={{ "--n": tabs.length, "--i": index } as React.CSSProperties}>
          {found >= 0 && <span className="nav-pill" aria-hidden="true" />}
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} className="navlink" aria-current={isActive(t) ? "page" : undefined}>
              <DotIcon name={t.icon} size={22} />
              <span>{t.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
