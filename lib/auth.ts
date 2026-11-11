// Who is signed in, and what may they see? (BR7: only the owner sends orders or changes stock, prices and settings.)
// The database also enforces this with row-level security. These checks keep the screens and routes in line with it.
import { cache } from "react";
import { redirect } from "next/navigation";
import { getStore } from "@/lib/data";
import type { Me } from "@/lib/data/types";

/** The signed-in person, or null when nobody is signed in. Looked up once per page. */
export const getMe = cache(async (): Promise<Me | null> => {
  try { return await getStore().getMe(); } catch { return null; }
});

/** For owner-only pages. Helpers go to the Sell screen. */
export async function requireOwner(): Promise<Me> {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "owner") redirect("/sell");
  return me;
}

/** For product-team pages (festival calendar). */
export async function requireTeam(): Promise<Me> {
  const me = await requireOwner();
  if (!me.isTeam) redirect("/more");
  return me;
}

// ----- for API routes: return a response to send back, or null when the person is allowed -----
export async function ownerOnly(): Promise<Response | null> {
  try {
    const me = await getStore().getMe();
    return me.role === "owner" ? null : new Response("Only the owner can do this.", { status: 403 });
  } catch {
    return new Response("Please sign in.", { status: 401 });
  }
}

export async function teamOnly(): Promise<Response | null> {
  try {
    const me = await getStore().getMe();
    return me.role === "owner" && me.isTeam ? null : new Response("Only the product team can do this.", { status: 403 });
  } catch {
    return new Response("Please sign in.", { status: 401 });
  }
}
