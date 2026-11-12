// "Demo login": email + password sign-in for EXACTLY TWO accounts (one owner, one helper of the demo shop), for
// reviewers who cannot or should not use a personal Google account. SERVER ONLY.
//
// - The two emails come from the server settings DEMO_OWNER_EMAIL and DEMO_HELPER_EMAIL. Without both, the form is hidden.
// - NO password is in the code or in any setting. The passwords live only in Supabase Auth, where you created the two users.
// - Any other email is refused here, before Supabase is asked (the answer is the same as for a wrong password).
// - The account must already belong to the demo shop with the right role (supabase/link_demo_accounts.sql). If it does
//   not, the person is signed out again with a plain message, so a reviewer can never end up creating a shop by accident.
if (typeof window !== "undefined") throw new Error("Demo login runs on the server only.");

type Env = Record<string, string | undefined>;
export type DemoRole = "owner" | "helper";

const norm = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The two demo emails, or null when demo login is not switched on (both must be set, valid and different). */
export function demoAccounts(env: Env = process.env): { owner: string; helper: string } | null {
  const owner = norm(env.DEMO_OWNER_EMAIL);
  const helper = norm(env.DEMO_HELPER_EMAIL);
  if (!EMAIL.test(owner) || !EMAIL.test(helper) || owner === helper) return null;
  return { owner, helper };
}

/** Which demo account this email is, or null when it is neither. */
export function matchDemoAccount(email: unknown, env: Env = process.env): DemoRole | null {
  const a = demoAccounts(env);
  const e = norm(email);
  if (!a || !e) return null;
  return e === a.owner ? "owner" : e === a.helper ? "helper" : null;
}

export interface DemoLoginDeps {
  env?: Env;
  live: boolean; // is the app connected to Supabase?
  signIn(email: string, password: string): Promise<{ userId: string } | { problem: "wrong" | "busy" | "down" }>;
  readRow(userId: string): Promise<{ role: string; shopId: string | null } | null>;
  signOut(): Promise<void>;
}
export type DemoLoginResult = { status: number; message?: string; role?: DemoRole };

const WRONG = "The demo email or password is not right.";

export async function handleDemoLogin(body: unknown, deps: DemoLoginDeps): Promise<DemoLoginResult> {
  const env = deps.env ?? process.env;
  if (!deps.live) return { status: 400, message: "Demo login is used only when the app is connected to Supabase. In demo mode no sign-in is needed." };
  if (!demoAccounts(env)) return { status: 404, message: "Demo login is not switched on." };

  const b = (body ?? {}) as { email?: unknown; password?: unknown };
  const role = matchDemoAccount(b.email, env);
  const password = typeof b.password === "string" ? b.password : "";
  // Not a demo email, or no password: refused here. Same words as a wrong password, so nobody can use this to look around.
  if (!role || !password || password.length > 200) return { status: 401, message: WRONG };

  const out = await deps.signIn(norm(b.email), password);
  if ("problem" in out) {
    return out.problem === "busy" ? { status: 429, message: "Too many tries. Please wait a minute and try again." }
      : out.problem === "down" ? { status: 503, message: "Sign-in is not working right now. Please try again." }
      : { status: 401, message: WRONG };
  }

  // Signed in. Check the account belongs to the demo shop with the right role. If not, sign out again.
  const row = await deps.readRow(out.userId);
  if (!row || !row.shopId) {
    await deps.signOut();
    return { status: 409, message: "This demo account is not linked to the demo shop yet. The project owner must run supabase/link_demo_accounts.sql." };
  }
  if (row.role !== role) {
    await deps.signOut();
    return { status: 409, message: `This demo account has the wrong role in the database (it should be ${role}). The project owner must run supabase/link_demo_accounts.sql again.` };
  }
  return { status: 200, role };
}
