// Signs the person out on THIS phone only, then goes to the sign-in page. Live mode only (demo mode has no accounts).
// scope "local": the demo accounts are shared by many people, so signing out here must not sign everybody else out.
import { createBrowserClient } from "@supabase/ssr";

export async function signOutHere(): Promise<void> {
  const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  await sb.auth.signOut({ scope: "local" });
  window.location.href = "/login";
}
