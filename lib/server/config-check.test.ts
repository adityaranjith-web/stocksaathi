import { afterEach, describe, expect, it } from "vitest";
import { settingsPresent } from "./config-check";

const NAMES = ["AI_MODE", "AI_FORECASTER", "AI_FORECAST_KEY", "AI_GEMINI_MODEL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "DEMO_OWNER_EMAIL", "DEMO_HELPER_EMAIL"];
const saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
afterEach(() => { for (const n of NAMES) { if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n]; } });

describe("/api/health settings check says yes or no, never a value", () => {
  it("AI is off and not ready when nothing is set", () => {
    for (const n of NAMES) delete process.env[n];
    expect(settingsPresent()).toMatchObject({ AI_MODE: "off", AI_FORECASTER: false, AI_FORECAST_KEY: false, AI_READY: false, DEMO_LOGIN: false });
  });
  it("shows Gemini as ready only when mode, provider and key are all set", () => {
    process.env.AI_MODE = "shadow"; process.env.AI_FORECASTER = "gemini";
    expect(settingsPresent()).toMatchObject({ AI_MODE: "shadow", AI_FORECASTER: true, AI_FORECAST_KEY: false, AI_READY: false });
    process.env.AI_FORECAST_KEY = "secret-key-value-1234567890";
    expect(settingsPresent()).toMatchObject({ AI_FORECAST_KEY: true, AI_READY: true });
  });
  it("never contains a secret value", () => {
    process.env.AI_MODE = "shadow"; process.env.AI_FORECASTER = "gemini";
    process.env.AI_FORECAST_KEY = "secret-key-value-1234567890";
    process.env.CRON_SECRET = "cron-secret-value-1234567890";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-value-1234567890";
    process.env.DEMO_OWNER_EMAIL = "owner.demo@example.com"; process.env.DEMO_HELPER_EMAIL = "helper.demo@example.com";
    const text = JSON.stringify(settingsPresent());
    for (const secret of ["secret-key-value", "cron-secret-value", "service-role-value", "owner.demo@example.com", "helper.demo@example.com"]) expect(text).not.toContain(secret);
  });
});
