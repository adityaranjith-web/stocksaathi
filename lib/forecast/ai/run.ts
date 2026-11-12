// Asks the AI provider about every item of ONE shop and turns the answers into rows to save.
// Shared by the "Run AI forecast now" button (shadow.ts) and the nightly job (lib/nightly.ts).
//
// The rule of this file: the AI is a bonus. If it is slow, down, out of free requests or answers badly, this
// returns what it has and says why it stopped. It never throws for an AI problem, so the Forecast Desk, the
// reorder list and the nightly job carry on exactly as before. Nothing here changes an order.
import type { DeskResult } from "@/lib/forecast/desk";
import { buildSeries } from "@/lib/desk-service";
import type { AiForecastRow, Item, Sale } from "@/lib/data/types";
import { buildAiRequest } from "./payload";
import { AiUnavailableError, type AiForecastResult, type Forecaster } from "./types";

export interface AiCollected {
  rows: AiForecastRow[];
  failed: number; // items that got no usable answer
  /** Why asking stopped early: "limit" = the free limit is used up, "error" = the service is down or not usable, "time" = out of time. null = it did not stop. */
  stopped: "limit" | "error" | "time" | null;
  firstError: string | null;
}

/** Items asked at the same time when the provider answers one item per call. */
const PARALLEL = 4;
/** After this many calls in a row fail, stop asking (the service is not working). */
const MAX_FAILED_CALLS_IN_A_ROW = 2;

export async function collectAiForecasts(args: {
  forecaster: Forecaster;
  items: Item[];
  results: Map<string, DeskResult>;
  sales: Pick<Sale, "date" | "itemId" | "qty">[];
  calendar: { date: string; name: string; upliftPct: number }[];
  onOrder: Record<string, number>;
  asOf: string;
  runDate: string;
  batchSize?: number; // items per call when the provider can answer several at once
  deadline?: number; // Date.now() value after which no new call is started
  now?: () => number;
}): Promise<AiCollected> {
  const { forecaster, items, results, sales, calendar, onOrder, asOf, runDate } = args;
  const now = args.now ?? Date.now;
  const out: AiCollected = { rows: [], failed: 0, stopped: null, firstError: null };

  const jobs = items.flatMap((item) => {
    const result = results.get(item.id);
    if (!result) return [];
    const horizonDays = item.leadTimeDays + item.orderCoverDays;
    const input = { itemId: item.id, leadTimeDays: item.leadTimeDays, minSafetyStock: item.minSafetyStock, orderCoverDays: item.orderCoverDays, currentStock: item.currentStock, onOrder: onOrder[item.id] ?? 0 };
    const request = buildAiRequest({ item, input, result, series: buildSeries(item.id, sales, asOf), calendar, asOf, horizonDays });
    return [{ item, result, horizonDays, request }];
  });
  type Job = (typeof jobs)[number];

  const keep = (job: Job, ai: AiForecastResult) => {
    out.rows.push({ runDate, itemId: job.item.id, provider: forecaster.id, aiUnitsPerDay: ai.unitsPerDay, blendUnitsPerDay: job.result.forecast, horizonDays: job.horizonDays, low: ai.low ?? null, high: ai.high ?? null });
  };
  const fail = (n: number, why: string) => { out.failed += n; out.firstError ??= why; };
  const stop = (reason: "limit" | "error" | "time", pendingFrom: number) => {
    out.stopped = reason;
    out.failed += jobs.length - pendingFrom; // everything not asked yet counts as "no answer"
  };

  if (forecaster.forecastMany) {
    const size = Math.max(1, args.batchSize ?? 10);
    let failedInARow = 0;
    for (let i = 0; i < jobs.length; i += size) {
      if (args.deadline !== undefined && now() > args.deadline) { stop("time", i); break; }
      const batch = jobs.slice(i, i + size);
      try {
        const answers = await forecaster.forecastMany(batch.map((j) => j.request));
        failedInARow = 0;
        for (const j of batch) {
          const a = answers.get(j.item.id);
          if (a) keep(j, a); else fail(1, "The AI gave no usable answer for an item.");
        }
      } catch (e) {
        const reason = e instanceof AiUnavailableError ? e.reason : "error";
        fail(batch.length, (e as Error).message);
        failedInARow++;
        if (reason === "limit") { stop("limit", i + batch.length); break; } // the free limit is gone: do not ask again today
        if (failedInARow >= MAX_FAILED_CALLS_IN_A_ROW) { stop("error", i + batch.length); break; }
      }
    }
    return out;
  }

  // Providers that answer one item per call (the practice model and a web service): a few at a time.
  let limitHit = false;
  for (let i = 0; i < jobs.length && !limitHit; i += PARALLEL) {
    if (args.deadline !== undefined && now() > args.deadline) { stop("time", i); break; }
    await Promise.all(jobs.slice(i, i + PARALLEL).map(async (j) => {
      try {
        keep(j, await forecaster.forecast(j.request));
      } catch (e) {
        fail(1, (e as Error).message);
        if (e instanceof AiUnavailableError && e.reason === "limit") limitHit = true;
      }
    }));
    if (limitHit) stop("limit", Math.min(jobs.length, i + PARALLEL));
  }
  return out;
}
