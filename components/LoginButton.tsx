"use client";
import { createBrowserClient } from "@supabase/ssr";
import Button from "@/components/ui/Button";

export default function LoginButton() {
  async function signIn() {
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
  }
  return <Button full icon="next" onClick={signIn}>Sign in with Google</Button>;
}
