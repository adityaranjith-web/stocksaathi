"use client";
import { useRouter } from "next/navigation";

// Demo mode only: lets you try the app as the owner or as a helper (BR7). In live mode the role comes from the
// database and this switch is not shown. The choice is kept in a cookie that only demo mode reads.
export default function RoleSwitch({ role }: { role: "owner" | "helper" }) {
  const router = useRouter();
  function pick(next: "owner" | "helper") {
    if (next === role) return;
    document.cookie = `ss_role=${next}; path=/; max-age=31536000; SameSite=Lax`;
    router.push(next === "helper" ? "/sell" : "/");
    router.refresh();
  }
  return (
    <div role="group" aria-label="Try the app as" className="glass flex items-center gap-1 rounded-full p-1">
      <span className="px-2 text-xs font-semibold text-ink-2">Try as</span>
      {(["owner", "helper"] as const).map((r) => (
        <button key={r} type="button" aria-pressed={role === r} onClick={() => pick(r)}
          className={`min-h-[44px] rounded-full px-4 text-sm font-bold ${role === r ? "bg-ink text-inverse" : "text-ink"}`}>
          {r === "owner" ? "Owner" : "Helper"}
        </button>
      ))}
    </div>
  );
}
