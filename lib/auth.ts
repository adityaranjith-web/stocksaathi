// Who is signed in, and what may they see? (BR7: only the owner sends orders or changes stock, prices and settings.)
// The database also enforces this with row-level security. These checks keep the screens and routes in line with it.
import { cache } from "react";
import { redirect } from "next/navigation";
import { getStore } from "@/lib/data";
import { AccessError, SetupError } from "@/lib/data/errors";
import type { Me } from "@/lib/data/types";

export type Access =
  | { state: "ok"; me: Me }
  | { state: "signed-out" }
  | { state: "no-shop" } // signed in with Google, but no shop and no helper invite: show "Create your shop"
  | { state: "error"; message: string }; // the database or its set-up is wrong

/** Looked up once per page. Never mistakes a broken database for "signed out". */
export const getAccess = cache(async (): Promise<Access> => {
  try {
    return { state: "ok", me: await getStore().getMe() };
  } catch (e) {
    if (e instanceof AccessError) return { state: e.code };
    if (e instanceof SetupError) return { state: "error", message: e.message };
    return { state: "error", message: (e as Error).message };
  }
});

/** The signed-in person with a shop, or null (used by the layout, which must never crash). */
export const getMe = cache(async (): Promise<Me | null> => {
  const a = await getAccess();
  return a.state === "ok" ? a.me : null;
});

/** Any signed-in person with a shop (owner or helper). Everyone else is sent where they need to go. */
export async function requireUser(): Promise<Me> {
  const a = await getAccess();
  if (a.state === "ok") return a.me;
  if (a.state === "no-shop") redirect("/onboarding");
  if (a.state === "error") throw new Error(a.message); // shown by app/error.tsx; the full text is in the server log
  redirect("/login");
}

/** For owner-only pages. Helpers go to the Sell screen. */
export async function requireOwner(): Promise<Me> {
  const me = await requireUser();
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
async function who(): Promise<{ me: Me } | { denied: Response }> {
  const a = await getAccess();
  if (a.state === "ok") return { me: a.me };
  if (a.state === "no-shop") return { denied: new Response("Create your shop first.", { status: 403 }) };
  if (a.state === "error") return { denied: new Response(a.message, { status: 503 }) };
  return { denied: new Response("Please sign in.", { status: 401 }) };
}

export async function ownerOnly(): Promise<Response | null> {
  const w = await who();
  if ("denied" in w) return w.denied;
  return w.me.role === "owner" ? null : new Response("Only the owner can do this.", { status: 403 });
}

export async function teamOnly(): Promise<Response | null> {
  const w = await who();
  if ("denied" in w) return w.denied;
  return w.me.role === "owner" && w.me.isTeam ? null : new Response("Only the product team can do this.", { status: 403 });
}
