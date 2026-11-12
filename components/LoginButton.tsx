"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";
import Button from "@/components/ui/Button";

export default function LoginButton() {
  const [problem, setProblem] = useState<string | null>(null);
  async function signIn() {
    setProblem(null);
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
    if (error) setProblem("Google sign-in could not start. The project owner should check that Google sign-in is switched on in Supabase.");
  }
  return (
    <div className="space-y-3">
      <Button full icon="next" onClick={signIn}>Sign in with Google</Button>
      {problem && <p role="alert" className="glass-alert rounded-[16px] border p-3 text-sm font-semibold">{problem}</p>}
    </div>
  );
}
