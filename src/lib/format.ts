/**
 * Display formatting for money and verdicts.
 *
 * Two rules run through this file:
 *
 *   - null is never rendered as zero. "No spend" and "spend unknown" are
 *     different facts and must look different.
 *   - A number is never printed with more precision than the data supports.
 *     The zero-conversion CAC ceiling is mathematically real but statistically
 *     meaningless, so it is rendered as "and up" rather than as a figure.
 */
import type { CacEstimate, CacVerdict } from "@/lib/stats/confidence";

export type Tone = "success" | "danger" | "warning" | "neutral";

/**
 * Above this, a CAC upper bound is an artifact of the prior rather than
 * evidence, and we decline to print it. Ten times a plausible enterprise CAC.
 */
const MEANINGLESS_CEILING_CENTS = 5_000_00;

export function formatCents(
  cents: number | null | undefined,
  options: { currency?: string; precise?: boolean } = {},
): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";

  const { currency = "USD", precise = false } = options;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: precise ? 2 : 0,
    maximumFractionDigits: precise ? 2 : 0,
  }).format(cents / 100);
}

/** Abbreviated money, for metric tiles and axis labels where space is tight. */
export function formatCompactCents(
  cents: number | null | undefined,
  options: { currency?: string } = {},
): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";

  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? "-" : "";
  const symbol = options.currency === "EUR" ? "€" : options.currency === "GBP" ? "£" : "$";

  if (abs >= 1_000_000) return `${sign}${symbol}${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${trim(abs / 1_000)}k`;
  return `${sign}${symbol}${Math.round(abs).toLocaleString("en-US")}`;
}

/** One decimal, but no trailing ".0". */
function trim(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded);
}

/**
 * The credible interval as a range.
 *
 * When the upper bound is meaningless — which is the zero-conversion case —
 * renders "$199 and up" instead of a figure, so the UI never implies a
 * precision the data does not have.
 */
export function formatCacRange(
  estimate: Pick<CacEstimate, "loCents" | "hiCents" | "conversions">,
  options: { currency?: string } = {},
): string {
  const { loCents, hiCents } = estimate;
  if (loCents === null) return "—";

  const lo = formatCents(loCents, options);
  if (hiCents === null || hiCents >= MEANINGLESS_CEILING_CENTS) return `${lo} and up`;

  return `${lo}–${formatCents(hiCents, options)}`;
}

const VERDICTS: Record<CacVerdict, { text: string; tone: Tone; hint: string }> = {
  LIKELY_GOOD: {
    text: "Likely good",
    tone: "success",
    hint: "The whole credible interval sits below your target CAC.",
  },
  LIKELY_BAD: {
    text: "Likely bad",
    tone: "danger",
    hint: "The whole credible interval sits above your target CAC.",
  },
  TOO_EARLY: {
    // Deliberately not a failure tone: an untested ad is not a bad ad, and
    // colouring it red is how people kill winners on three conversions.
    text: "Too early",
    tone: "warning",
    hint: "The interval still straddles your target. Not enough data to call it.",
  },
  NO_DATA: {
    text: "No data",
    tone: "neutral",
    hint: "No spend recorded in this period.",
  },
  NO_TARGET: {
    text: "No target set",
    tone: "neutral",
    hint: "Set a target CAC in settings to get scale and cut verdicts.",
  },
};

export function verdictLabel(verdict: CacVerdict) {
  return VERDICTS[verdict];
}

/** Whole percentage with a sign, e.g. "+12%" / "-29%". */
export function formatSignedPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US");
}
