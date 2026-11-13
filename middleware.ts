import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isOpenPath } from "@/lib/open-paths";

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
  // Which addresses are open to signed-out visitors is decided in lib/open-paths.ts (the sign-in page, the set-up check, the Privacy Policy and Terms, and so on).
  const open = isOpenPath(req.nextUrl.pathname);
  if (!data.user && !open) return NextResponse.redirect(new URL("/login", req.url));
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
