// Which addresses a signed-out visitor may open (live mode). Everything else sends the visitor to /login.
// Used by middleware.ts, and tested in open-paths.test.ts.

/** Open this address and everything under it (it is matched at the start of the path). */
const OPEN_PREFIXES = [
  "/login",
  "/auth", // the Google sign-in comes back here
  "/api/cron/", // Vercel's scheduler has no Google sign-in. The route checks CRON_SECRET itself.
  "/api/health", // the set-up self-check; it returns no data and no keys
  "/api/demo-login", // the "Demo login" form's route: for people who are not signed in yet (two emails only)
];

/**
 * Open this exact page. These two are public on purpose: Google needs a Privacy Policy and Terms of Service that anyone can
 * open before it lets an app be published. "/privacy-x" or "/terms/x" are NOT open: only the page itself.
 */
const OPEN_PAGES = ["/privacy", "/terms"];

export function isOpenPath(pathname: string): boolean {
  if (OPEN_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return OPEN_PAGES.includes(clean);
}
