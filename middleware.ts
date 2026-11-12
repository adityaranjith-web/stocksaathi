import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Live mode only: keeps the Supabase session fresh and sends signed-out users to /login.
export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // The page path, passed on so the server timing log (lib/perf.ts) can name the page it is timing.
  const forward = new Headers(req.headers);
  forward.set("x-pathname", req.nextUrl.pathname);
  if (!url || !key) return NextResponse.next({ request: { headers: forward } }); // demo mode

  let res = NextResponse.next({ request: { headers: forward } });
  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: { headers: forward } });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await sb.auth.getUser();
  // /api/cron/* is called by Vercel's scheduler, which has no Google sign-in. The route checks CRON_SECRET itself.
  // /api/health is the set-up self-check; it must work even when sign-in does not. It returns no data and no keys.
  // /api/demo-login is the "Demo login" form's route: it is for people who are not signed in yet (and accepts two emails only).
  const open = ["/login", "/auth", "/api/cron/", "/api/health", "/api/demo-login"].some((p) => req.nextUrl.pathname.startsWith(p));
  if (!data.user && !open) return NextResponse.redirect(new URL("/login", req.url));
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
