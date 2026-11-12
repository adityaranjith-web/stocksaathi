import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/data/supabase";

// Google sends the person back here. Swap the one-time code for a session, then go home.
// If anything fails, go back to the sign-in screen with a message instead of looping.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, url.origin));
  if (url.searchParams.get("error")) return back("denied");
  const code = url.searchParams.get("code");
  if (!code) return back("signin");
  const { error } = await (await supabaseServer()).auth.exchangeCodeForSession(code);
  if (error) {
    console.error(`auth callback: could not start the session: ${error.message}`);
    return back("signin");
  }
  return NextResponse.redirect(new URL("/", url.origin)); // Home sends a person with no shop to "Create your shop"
}
