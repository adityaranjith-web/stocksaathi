import DotIcon from "./DotIcon";

// Small message that pops up above the navigation bar. Show it for about 2 seconds, then remove it.
// tone="alert" (red) is for errors only.
export default function Toast({ children, tone = "ok" }: { children: React.ReactNode; tone?: "ok" | "alert" }) {
  return (
    <div role={tone === "alert" ? "alert" : "status"} className={`toast ${tone === "alert" ? "toast-alert" : ""}`}>
      <DotIcon name={tone === "alert" ? "alert" : "check"} size={22} />
      <span>{children}</span>
    </div>
  );
}
