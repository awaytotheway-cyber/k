/**
 * Attribution models.
 *
 * Pure functions: given the touches on a path and when the conversion
 * happened, decide how much credit each touch gets. No database, no clock.
 *
 * Two invariants hold for every model, and are the reason this file is tested
 * harder than anything else in the codebase:
 *
 *   1. Credit fractions sum to exactly 1. Break this and every report either
 *      invents revenue or loses it.
 *   2. Credited cents sum to exactly the conversion value. Rounding each share
 *      independently does not achieve this, so allocation uses largest
 *      remainder rather than naive rounding.
 */
import type { AttributionModel } from "@/generated/prisma/enums";

export type TouchPoint = {
  id: string;
  occurredAt: Date;
};

/** Half-life for TIME_DECAY, in hours. Seven days is the category convention. */
export const TIME_DECAY_HALF_LIFE_HOURS = 168;

/** Credit given to the first and last touch under POSITION_BASED. */
const POSITION_EDGE_SHARE = 0.4;

/**
 * Credit per touch, in the same order as `touches` (which must be sorted
 * oldest first). Returns an array summing to 1, or [] for an empty path.
 */
export function creditFractions(
  touches: TouchPoint[],
  model: AttributionModel,
  convertedAt: Date,
): number[] {
  const n = touches.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  switch (model) {
    case "LAST_CLICK": {
      const out = new Array<number>(n).fill(0);
      out[n - 1] = 1;
      return out;
    }

    case "FIRST_CLICK": {
      const out = new Array<number>(n).fill(0);
      out[0] = 1;
      return out;
    }

    case "LINEAR":
      return new Array<number>(n).fill(1 / n);

    case "POSITION_BASED": {
      // With two touches each one is both first and last, so an even split is
      // the only consistent reading of 40/20/40.
      if (n === 2) return [0.5, 0.5];

      const middleShare = (1 - 2 * POSITION_EDGE_SHARE) / (n - 2);
      return touches.map((_, i) =>
        i === 0 || i === n - 1 ? POSITION_EDGE_SHARE : middleShare,
      );
    }

    case "TIME_DECAY": {
      const ages = touches.map((t) => {
        const hours = (convertedAt.getTime() - t.occurredAt.getTime()) / 3_600_000;
        // Clock skew between a visitor's browser and our server can place a
        // touch after the conversion. Treat that as "at the moment of".
        return Math.max(0, hours);
      });

      // Weights are 2^(-age/halfLife). Measuring age from the most recent
      // touch instead of from the conversion gives identical results after
      // normalisation, but keeps the exponent small — otherwise a path that is
      // months old underflows every weight to zero and normalising is 0/0.
      const youngest = Math.min(...ages);
      const weights = ages.map((age) =>
        Math.pow(2, -(age - youngest) / TIME_DECAY_HALF_LIFE_HOURS),
      );

      const total = weights.reduce((a, b) => a + b, 0);
      if (!(total > 0) || !Number.isFinite(total)) {
        return new Array<number>(n).fill(1 / n);
      }
      return weights.map((w) => w / total);
    }
  }
}

/**
 * Split `totalCents` across `fractions` so the parts sum to exactly
 * `totalCents`.
 *
 * Largest remainder: floor every share, then hand the leftover cents to
 * whichever shares lost the most to flooring. Rounding each share on its own
 * would drift by a cent or two per conversion, which compounds into a visible
 * gap between "revenue" and "attributed revenue" over a quarter.
 */
export function allocateCents(totalCents: number, fractions: number[]): number[] {
  const n = fractions.length;
  if (n === 0) return [];

  const sign = totalCents < 0 ? -1 : 1;
  const magnitude = Math.abs(Math.trunc(totalCents));

  const exact = fractions.map((f) => Math.max(0, f) * magnitude);
  const floored = exact.map((value) => Math.floor(value));

  let remaining = magnitude - floored.reduce((a, b) => a + b, 0);

  // Biggest fractional part first; ties go to the earlier index so the result
  // is deterministic for identical inputs.
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let i = 0; remaining > 0 && i < order.length; i++) {
    floored[order[i]!.index]! += 1;
    remaining -= 1;
  }

  return floored.map((value) => value * sign);
}
