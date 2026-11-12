import { isLive } from "@/lib/data";
import { supabaseServer } from "@/lib/data/supabase";
import { handleDemoLogin } from "@/lib/demo-login";

export const dynamic = "force-dynamic";

// Demo login: email + password for the two demo accounts only (lib/demo-login.ts). Open to signed-out visitors,
// like the Google sign-in. No password is stored here: Supabase checks it.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const sb = isLive ? await supabaseServer() : null;
  const res = await handleDemoLogin(body, {
    live: isLive,
    async signIn(email, password) {
      const { data, error } = await sb!.auth.signInWithPassword({ email, password });
      if (data?.user && !error) return { userId: data.user.id };
      if (error?.status === 429) return { problem: "busy" };
      if (error && (error.status === 400 || error.status === 401 || /invalid login/i.test(error.message))) return { problem: "wrong" };
      console.error(`demo login: Supabase did not sign in (status ${error?.status ?? "none"})`);
      return { problem: "down" };
    },
    async readRow(userId) {
      const { data } = await sb!.from("users").select("role, shop_id").eq("id", userId).maybeSingle();
      return data ? { role: data.role as string, shopId: (data.shop_id as string | null) ?? null } : null;
    },
    async signOut() { await sb!.auth.signOut(); },
  });
  // A refusal is a plain sentence (the screens show it as it is, like every other route); success is a small JSON answer.
  if (res.message) return new Response(res.message, { status: res.status, headers: { "Cache-Control": "no-store" } });
  return Response.json({ ok: true, role: res.role }, { headers: { "Cache-Control": "no-store" } });
}
