// Which version of the app is running (the short Git commit that Vercel built), so "am I on the latest version?" can be answered
// from a screen instead of guessed. Empty when the app runs on a computer (no Vercel).
export function buildVersion(env: Record<string, string | undefined> = process.env): string | null {
  const sha = (env.VERCEL_GIT_COMMIT_SHA ?? "").trim();
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : null;
}
