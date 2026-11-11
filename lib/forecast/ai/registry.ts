// Chooses the AI provider and mode from server settings. SERVER ONLY.
// AI_MODE        off (default) | shadow | blend
// AI_FORECASTER  mock | http
// AI_FORECAST_URL, AI_FORECAST_KEY  for the "http" provider. These are secrets: keep them in Vercel
// environment variables, never in code and never with a NEXT_PUBLIC_ name.
import { httpForecaster, mockForecaster } from "./providers";
import type { AiMode, Forecaster } from "./types";

if (typeof window !== "undefined") throw new Error("AI settings are available on the server only.");

type Env = Record<string, string | undefined>;

export function getAiMode(env: Env = process.env): AiMode {
  const m = (env.AI_MODE ?? "").trim().toLowerCase();
  return m === "shadow" || m === "blend" ? m : "off";
}

/** The provider to use, or null when AI is off or not set up properly. */
export function getForecaster(env: Env = process.env): Forecaster | null {
  if (getAiMode(env) === "off") return null;
  const which = (env.AI_FORECASTER ?? "").trim().toLowerCase();
  if (which === "mock") return mockForecaster;
  if (which === "http") {
    const url = (env.AI_FORECAST_URL ?? "").trim();
    // Secure addresses only (plain http is allowed for localhost while developing).
    if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url)) return null;
    return httpForecaster(url, env.AI_FORECAST_KEY?.trim() || undefined);
  }
  return null;
}
