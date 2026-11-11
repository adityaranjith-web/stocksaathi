import type { ReactNode } from "react";
import DotIcon from "./DotIcon";

// Plain badge. tone="alert" is the red one: use it only for things the owner must look at.
export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "alert"; children: ReactNode }) {
  return <span className={`badge ${tone === "alert" ? "badge-alert" : ""}`}>{tone === "alert" && <DotIcon name="alert" size={16} />}{children}</span>;
}

// Confidence as a three-dot meter plus words, so it never depends on colour alone.
export function ConfidenceBadge({ level }: { level: "High" | "Medium" | "Low" }) {
  const lit = level === "High" ? 3 : level === "Medium" ? 2 : 1;
  return (
    <span className={`badge ${level === "Low" ? "badge-alert" : ""}`}>
      <svg viewBox="0 0 18 6" width={22} height={8} fill="currentColor" aria-hidden="true">
        {[0, 1, 2].map((i) => <circle key={i} cx={3 + i * 6} cy={3} r={2.4} opacity={i < lit ? 1 : 0.28} />)}
      </svg>
      {level} confidence
    </span>
  );
}
