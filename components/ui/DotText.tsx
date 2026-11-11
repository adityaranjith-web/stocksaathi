import type { ReactNode } from "react";

// Dot-matrix text. Use DotNumber for big figures and DotLabel for short capital-letter labels.
// Keep these short: dot-matrix letters are for headings and numbers, not for sentences.
export function DotNumber({ children, size = 56, className = "" }: { children: ReactNode; size?: number; className?: string }) {
  return <span className={`dot-number ${className}`} style={{ fontSize: size }}>{children}</span>;
}

export function DotLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`dot-label ${className}`}>{children}</span>;
}
