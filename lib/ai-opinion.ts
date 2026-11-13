// The AI second opinion shown on "Why this number" (see docs/ai-integration.md). Pure code, tested in ai-opinion.test.ts.
import type { AiForecastRow } from "@/lib/data/types";

/**
 * The latest AI forecast of one item from the AI provider that is switched on, or undefined.
 * It does NOT depend on the shop's date: whichever day the AI was last asked, that is the one shown. (A shop whose date
 * is ahead of the real date, or behind the AI's run date, still sees it.) The page says on which day it was asked.
 */
export function latestAiOpinion(rows: AiForecastRow[], provider: string, itemId: string): AiForecastRow | undefined {
  let best: AiForecastRow | undefined;
  for (const r of rows) {
    if (r.provider !== provider || r.itemId !== itemId) continue;
    if (!best || r.runDate > best.runDate) best = r;
  }
  return best;
}

/** What the box says when the AI is switched on but has no forecast for this item yet. */
export const NO_AI_OPINION_YET = "No AI forecast for this item yet. The AI is asked every night. You can also tap Run AI forecast now under More.";
