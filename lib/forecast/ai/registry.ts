// Chooses the AI provider and mode from server settings. SERVER ONLY.
// AI_MODE          off (default) | shadow | blend
// AI_FORECASTER    mock | http | gemini
// AI_FORECAST_KEY  the secret key, for "gemini" (required) and "http" (optional)
// AI_FORECAST_URL  for "http": the address of the service
// AI_GEMINI_MODEL  for "gemini": the model name (optional; see GEMINI_DEFAULT_MODEL)
// The key is a secret: keep it in Vercel environment variables, never in code and never with a NEXT_PUBLIC_ name.
import { GEMINI_DEFAULT_MODEL, geminiForecaster, httpForecaster, mockForecaster } from "./providers";
import type { AiMode, Forecaster } from "./types";

if (typeof window !== "undefined") throw new Error("AI settings are available on the server only.");

type Env = Record<string, string | undefined>;

export function getAiMode(env: Env = process.env): AiMode {
  const m = (env.AI_MODE ?? "").trim().toLowerCase();
  return m === "shadow" || m === "blend" ? m : "off";
}

/** Only plain model names go into the address that is called. Anything else is refused. */
const MODEL_NAME = /^[a-z0-9][a-z0-9._-]{1,63}$/i;

/** The provider to use, or null when AI is off or not set up properly. */
export function getForecaster(env: Env = process.env): Forecaster | null {
  if (getAiMode(env) === "off") return null;
  const which = (env.AI_FORECASTER ?? "").trim().toLowerCase();
  if (which === "mock") return mockForecaster;
  if (which === "gemini") {
    const key = (env.AI_FORECAST_KEY ?? "").trim();
    const model = (env.AI_GEMINI_MODEL ?? "").trim() || GEMINI_DEFAULT_MODEL;
    if (!key || !MODEL_NAME.test(model)) return null;
    return geminiForecaster(key, model);
  }
  if (which === "http") {
    const url = (env.AI_FORECAST_URL ?? "").trim();
    // Secure addresses only (plain http is allowed for localhost while developing).
    if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url)) return null;
    return httpForecaster(url, env.AI_FORECAST_KEY?.trim() || undefined);
  }
  return null;
}
