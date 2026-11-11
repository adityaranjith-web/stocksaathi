import { demoStore } from "./demo";
import { supabaseStore } from "./supabase";
import type { Store } from "./types";

/** Demo mode unless Supabase keys are set. */
export const isLive = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export function getStore(): Store {
  return isLive ? supabaseStore : demoStore;
}
