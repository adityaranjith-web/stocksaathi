"use client";
import { createBrowserClient } from "@supabase/ssr";
import Button from "@/components/ui/Button";

// Signs out of Google on this phone. Live mode only.
export default function SignOutButton({ variant = "ghost" }: { variant?: "ghost" | "primary" }) {
  async function out() {
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await sb.auth.signOut();
    window.location.href = "/login";
  }
  return <Button type="button" full variant={variant} onClick={out}>Sign out</Button>;
}
