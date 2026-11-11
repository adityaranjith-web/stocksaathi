import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import DotIcon, { type DotIconName } from "./DotIcon";

type Variant = "primary" | "ghost" | "alert";
const cls = (v: Variant, extra = "") => `btn btn-${v} ${extra}`.trim();

// One button for the whole app. Pass href to get a link that looks like a button.
// "alert" is red: only for risky actions such as deleting.
export default function Button({
  variant = "primary", icon, href, full = false, className = "", children, ...rest
}: {
  variant?: Variant; icon?: DotIconName; href?: string; full?: boolean; className?: string; children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const inner = <>{icon && <DotIcon name={icon} size={22} />}<span>{children}</span></>;
  const all = cls(variant, `${full ? "w-full" : ""} ${className}`);
  if (href) return <Link href={href} className={all}>{inner}</Link>;
  return <button className={all} {...rest}>{inner}</button>;
}
