/**
 * Date ranges and the conversion taxonomy reports are built on.
 *
 * Pure, so the boundary arithmetic that every figure depends on is testable
 * without a database.
 */
import type { AttributionModel, ConversionType } from "@/generated/prisma/enums";

export const RANGE_PRESETS = {
  "7d": { days: 7, label: "Last 7 days" },
  "30d": { days: 30, label: "Last 30 days" },
  "90d": { days: 90, label: "Last 90 days" },
} as const;

export type RangeKey = keyof typeof RANGE_PRESETS;
export const DEFAULT_RANGE: RangeKey = "30d";

export type DateRange = { from: Date; to: Date; days: number; key: RangeKey };

export function isRangeKey(value: string | undefined): value is RangeKey {
  return value !== undefined && value in RANGE_PRESETS;
}

/**
 * A preset range ending at the end of today, in UTC.
 *
 * Inclusive of both ends: "last 7 days" means today plus the six before it,
 * which is what a person means when they say it.
 */
export function resolveRange(key: string | undefined, now: Date = new Date()): DateRange {
  const resolved: RangeKey = isRangeKey(key) ? key : DEFAULT_RANGE;
  const { days } = RANGE_PRESETS[resolved];

  const to = new Date(now);
  to.setUTCHours(23, 59, 59, 999);

  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  from.setUTCHours(0, 0, 0, 0);

  return { from, to, days, key: resolved };
}

/** The equivalent window immediately before this one, for period-over-period. */
export function previousRange(range: DateRange): DateRange {
  const to = new Date(range.from);
  to.setUTCDate(to.getUTCDate() - 1);
  to.setUTCHours(23, 59, 59, 999);

  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (range.days - 1));
  from.setUTCHours(0, 0, 0, 0);

  return { from, to, days: range.days, key: range.key };
}

/**
 * Events that represent winning a customer, as opposed to money arriving.
 *
 * CAC divides spend by these. Counting subscriptions as well would double
 * count the same person — they convert once as a trial and again when they
 * pay — and halve every CAC in the product.
 */
export const ACQUISITION_EVENTS: ConversionType[] = ["SIGNUP", "TRIAL", "DEMO", "QUALIFIED"];

/** Events that carry money. */
export const REVENUE_EVENTS: ConversionType[] = ["PURCHASE", "SUBSCRIPTION", "EXPANSION"];

export const MODEL_LABELS: Record<AttributionModel, string> = {
  LAST_CLICK: "Last click",
  FIRST_CLICK: "First click",
  LINEAR: "Linear",
  TIME_DECAY: "Time decay",
  POSITION_BASED: "Position based",
};

export const DEFAULT_MODEL: AttributionModel = "LAST_CLICK";

export function isAttributionModel(value: string | undefined): value is AttributionModel {
  return value !== undefined && value in MODEL_LABELS;
}

export function resolveModel(value: string | undefined): AttributionModel {
  return isAttributionModel(value) ? value : DEFAULT_MODEL;
}

/** Percentage change, or null when the baseline was zero. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
