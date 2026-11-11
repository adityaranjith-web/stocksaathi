import type { ElementType, ReactNode } from "react";

// The basic frosted panel.
// blur=true  : real frosted blur. Use on a few big panels only.
// blur=false : flat translucent fill with the same edge and shadow. Use for lists and grids (fast on cheap phones).
// dots       : adds the faint dot grid in the top-right corner.
// delay      : step number for the staggered "rise" entrance (0, 1, 2, ...).
export default function Glass({
  as, blur = true, dots = false, alert = false, delay, className = "", style, children, ...rest
}: {
  as?: ElementType; blur?: boolean; dots?: boolean; alert?: boolean; delay?: number; className?: string; style?: React.CSSProperties; children?: ReactNode;
} & Record<string, unknown>) {
  const Tag = (as ?? "div") as ElementType;
  const cls = ["glass", blur ? "glass-blur" : "", dots ? "glass-dots" : "", alert ? "glass-alert" : "", delay !== undefined ? "rise" : "", className].filter(Boolean).join(" ");
  const merged = delay !== undefined ? ({ ...style, "--d": delay } as React.CSSProperties) : style;
  return <Tag className={cls} style={merged} {...rest}>{children}</Tag>;
}
