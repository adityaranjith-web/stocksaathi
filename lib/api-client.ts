// Small helper for screens that save data: sends JSON and returns either ok or a sentence to show on screen.
export async function sendJson(method: "POST" | "PUT" | "DELETE", url: string, body?: unknown): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) return { ok: false, error: (await res.text()) || "Not saved. Please try again." };
    return { ok: true, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, error: "No network. Please try again." };
  }
}
