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
/** Items answered in one Gemini call. 30 items = 3 calls, so one run uses only a few of the free requests. */
export const GEMINI_BATCH_SIZE = 10;

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
export function geminiForecaster(key: string, model = GEMINI_DEFAULT_MODEL, timeoutMs = 30000, fetchImpl: typeof fetch = fetch): Forecaster {
  async function many(requests: AiForecastRequest[]): Promise<Map<string, AiForecastResult>> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
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
        throw new AiUnavailableError("The AI service could not be reached.", "error");
      }
      if (res.status === 429) throw new AiUnavailableError("The free AI limit is used up for now.", "limit");
      if (!res.ok) throw new AiUnavailableError(`The AI service answered ${res.status}.`, "error");
      try {
        return parseGeminiAnswers(await res.json());
      } catch (e) {
        throw new AiUnavailableError((e as Error).message, "error");
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    id: "gemini",
    name: `Google Gemini (${model})`,
    forecastMany: many,
    async forecast(req) {
      const r = (await many([req])).get(req.item.id);
      if (!r) throw new Error("The AI gave no usable answer for this item.");
      return r;
    },
  };
}
