// Built-in AI providers. SERVER ONLY: the "http" and "gemini" providers use a secret key, which must never reach the browser.
import { AiUnavailableError, type AiForecastRequest, type AiForecastResult, type Forecaster } from "./types";

if (typeof window !== "undefined") throw new Error("AI providers run on the server only.");

/** Checks what an AI service sent back. Throws a plain sentence when it is not usable. */
export function parseAiResult(json: unknown): AiForecastResult {
  const o = (json ?? {}) as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const units = num(o.unitsPerDay);
  if (units === null || units < 0 || units > 100000) throw new Error("The AI answer has no valid unitsPerDay.");
  const low = num(o.low);
  const high = num(o.high);
  const result: AiForecastResult = { unitsPerDay: units };
  if (low !== null && high !== null && low >= 0 && low <= units && units <= high) { result.low = low; result.high = high; }
  if (typeof o.note === "string") result.note = o.note.slice(0, 200);
  return result;
}

/** A stand-in "AI" for trying the system without any account: the average of the last 7 days, with a 20% range. */
export const mockForecaster: Forecaster = {
  id: "mock",
  name: "Practice AI (7-day average)",
  async forecast(req: AiForecastRequest) {
    const last = req.salesDaily.slice(-7);
    const avg = last.length ? last.reduce((a, d) => a + d.qty, 0) / last.length : 0;
    return { unitsPerDay: avg, low: avg * 0.8, high: avg * 1.2, note: "Practice model: the plain 7-day average." };
  },
};

/**
 * Any AI service behind a web address. It receives the request as JSON (POST) and must answer
 * { "unitsPerDay": number, "low"?: number, "high"?: number, "note"?: string }.
 */
export function httpForecaster(url: string, key: string | undefined, timeoutMs = 15000): Forecaster {
  return {
    id: "http",
    name: "AI service",
    async forecast(req: AiForecastRequest) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
          body: JSON.stringify(req),
          signal: ctl.signal,
        });
        if (res.status === 429) throw new AiUnavailableError("The AI service says its limit is used up for now.", "limit");
        if (!res.ok) throw new Error(`The AI service answered ${res.status}.`);
        return parseAiResult(await res.json());
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// ---------- Google Gemini (has a free tier) ----------

/** The model used when AI_GEMINI_MODEL is not set: Google's cheapest, fastest text model (free tier). Change it with AI_GEMINI_MODEL. */
export const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
/**
 * Items answered in one Gemini call. 5 items = 6 calls for a 30-item shop. Smaller calls get smaller answers, which are
 * less likely to be cut off or to meet a busy service, and a failed call costs only 5 items. (It was 10: on 12 Nov 2026 two
 * of three calls got "503 service unavailable" from Google and only 10 of 30 items were saved.)
 */
export const GEMINI_BATCH_SIZE = 5;
/** Waits before the 1st and 2nd retry of a call that failed in a way that may pass (busy service, network, garbled answer). */
export const GEMINI_RETRY_DELAYS_MS = [2000, 4000];
/** A 429 that says "try again in N seconds" is waited out only if N is at most this long. Otherwise the free limit counts as used up. */
const MAX_429_WAIT_MS = 10_000;

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Google's error answer says what kind of problem it is in "error.status" (for example UNAVAILABLE). Only that short word is read. */
function googleStatusWord(text: string): string {
  const m = /"status"\s*:\s*"([A-Z_]{3,40})"/.exec(text);
  return m ? m[1] : "";
}
/** "retryDelay": "23s" in a 429 answer. Returns milliseconds, or undefined. */
function googleRetryDelayMs(text: string): number | undefined {
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(text);
  return m ? Math.round(parseFloat(m[1]) * 1000) : undefined;
}

const GEMINI_INSTRUCTIONS = [
  "You are a careful demand forecaster for a small Indian kirana (corner) shop.",
  "You get a list of items. Each has its recent daily unit sales (oldest first), upcoming festival days with an uplift %, its stock, and what a statistical Forecast Desk already says.",
  "For each item, give the average units sold per day over the next horizonDays days.",
  "Use the sales pattern, the weekday pattern and any festival inside the horizon. Use the Forecast Desk numbers as a guide, not as the answer.",
  "Never answer a negative number. Give a low and a high that surround your answer.",
  'Give a short, plain note in simple English (under 20 words), for example "Sales are rising and Deepavali is close."',
  "Answer every item once, using its exact id as itemId. Answer with JSON only.",
].join(" ");

const GEMINI_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      itemId: { type: "STRING" },
      unitsPerDay: { type: "NUMBER" },
      low: { type: "NUMBER" },
      high: { type: "NUMBER" },
      note: { type: "STRING" },
    },
    required: ["itemId", "unitsPerDay"],
  },
};

/** Reads the text that Gemini returned and turns it into answers by item id. Bad answers are left out, never guessed. */
export function parseGeminiAnswers(body: unknown): Map<string, AiForecastResult> {
  const parts = ((body as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] })?.candidates?.[0]?.content?.parts ?? []);
  const text = parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("").trim();
  if (!text) throw new Error("The AI gave no answer.");
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error("The AI answer was not in the expected form."); }
  const list = Array.isArray(json) ? json : Array.isArray((json as { results?: unknown })?.results) ? (json as { results: unknown[] }).results : null;
  if (!list) throw new Error("The AI answer was not in the expected form.");
  const out = new Map<string, AiForecastResult>();
  for (const entry of list) {
    const id = (entry as { itemId?: unknown } | null)?.itemId;
    if (typeof id !== "string" || out.has(id)) continue;
    try { out.set(id, parseAiResult(entry)); } catch { /* this item's answer is not usable: it is counted as failed by the caller */ }
  }
  return out;
}

/**
 * Google Gemini through its web API. The key is sent in a header, never in the address, and is never logged.
 * One call answers several items (forecastMany). A 429 (free limit used up) or any failure becomes AiUnavailableError.
 */
export function geminiForecaster(
  key: string, model = GEMINI_DEFAULT_MODEL, timeoutMs = 20000, fetchImpl: typeof fetch = fetch,
  opts: { sleep?: (ms: number) => Promise<void>; retryDelaysMs?: number[] } = {},
): Forecaster {
  const sleep = opts.sleep ?? pause;
  const delays = opts.retryDelaysMs ?? GEMINI_RETRY_DELAYS_MS;

  /** One call to Google. */
  async function once(requests: AiForecastRequest[], deadline?: number): Promise<Map<string, AiForecastResult>> {
    const ctl = new AbortController();
    const left = deadline === undefined ? timeoutMs : Math.max(1000, Math.min(timeoutMs, deadline - Date.now()));
    const timer = setTimeout(() => ctl.abort(), left);
    try {
      let res: Response;
      try {
        res = await fetchImpl(`${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: GEMINI_INSTRUCTIONS }] },
            contents: [{ role: "user", parts: [{ text: JSON.stringify({ items: requests }) }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: "application/json", responseSchema: GEMINI_SCHEMA },
          }),
          signal: ctl.signal,
        });
      } catch {
        // no answer in time, or no connection: it may work a moment later
        throw new AiUnavailableError("The AI service could not be reached in time.", "error", { retryable: true });
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const word = googleStatusWord(text);
        const detail = `${res.status}${word ? ` ${word}` : ""}`;
        if (res.status === 429) {
          // A short "retryDelay" means a per-minute limit: wait it out once. Otherwise the free limit is used up for today.
          const wait = googleRetryDelayMs(text);
          if (wait !== undefined && wait <= MAX_429_WAIT_MS) throw new AiUnavailableError(`The AI service answered ${detail}.`, "limit", { retryable: true, retryAfterMs: wait + 500 });
          throw new AiUnavailableError(`The free AI limit is used up for now (${detail}).`, "limit");
        }
        // 500, 502, 503, 504: the service is busy or restarting, and often answers a moment later. 400 and 403 will not change.
        throw new AiUnavailableError(`The AI service answered ${detail}.`, "error", { retryable: res.status >= 500 });
      }
      try {
        return parseGeminiAnswers(await res.json());
      } catch (e) {
        // an empty or garbled answer: asking again usually gives a good one
        throw new AiUnavailableError((e as Error).message, "error", { retryable: true });
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** One call, tried again (after a short wait) when the failure may pass, as long as there is time left. */
  async function many(requests: AiForecastRequest[], o: { deadline?: number } = {}): Promise<Map<string, AiForecastResult>> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await once(requests, o.deadline);
      } catch (e) {
        if (!(e instanceof AiUnavailableError) || !e.retryable || attempt >= delays.length) throw e;
        const wait = e.retryAfterMs ?? delays[attempt];
        if (o.deadline !== undefined && Date.now() + wait + 3000 > o.deadline) throw e; // not enough time left for another try
        await sleep(wait);
      }
    }
  }

  return {
    id: "gemini",
    name: `Google Gemini (${model})`,
    batchSize: GEMINI_BATCH_SIZE,
    forecastMany: many,
    async forecast(req) {
      const r = (await many([req])).get(req.item.id);
      if (!r) throw new Error("The AI gave no usable answer for this item.");
      return r;
    },
  };
}
