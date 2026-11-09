/**
 * How much should you trust this ad's CAC?
 *
 * Every tool in this category shows a cost per acquisition to the cent and
 * leaves you to guess whether three conversions mean anything. They do not.
 * This module puts an interval around the number and refuses to call a verdict
 * the data cannot support.
 *
 * The model
 * ---------
 * Conversions arrive as a Poisson process in spend: n ~ Poisson(lambda * S),
 * where S is dollars spent and lambda is conversions per dollar. With a Gamma
 * prior on lambda the posterior is conjugate:
 *
 *     lambda | n, S  ~  Gamma(shape = a0 + n, rate = b0 + S)
 *
 * CAC is 1 / lambda, so a credible interval for lambda inverts into one for
 * CAC — the upper CAC bound comes from the lower lambda quantile.
 *
 * The default prior (shape 0.5, rate 0) is deliberately weak: it is Jeffreys'
 * prior for a Poisson rate and contributes no imaginary spend, so the answer is
 * driven by observed data. With zero conversions the upper bound is genuinely
 * infinite, and we report that as "unbounded" rather than inventing a ceiling.
 *
 * Everything here is pure and deterministic. No clock, no database, no I/O.
 */

export type CacVerdict =
  /** The credible interval sits entirely below the target. Scale it. */
  | "LIKELY_GOOD"
  /** The credible interval sits entirely above the target. Cut it. */
  | "LIKELY_BAD"
  /** The interval straddles the target. Not enough evidence either way. */
  | "TOO_EARLY"
  /** No spend at all: nothing to estimate. */
  | "NO_DATA"
  /** An interval exists, but the workspace has set no target to judge against. */
  | "NO_TARGET";

export type CacEstimate = {
  conversions: number;
  spendCents: number;
  /** Posterior point estimate of CAC, or null when there is no spend. */
  pointCents: number | null;
  /** Lower bound of the credible interval. */
  loCents: number | null;
  /** Upper bound, or null when unbounded (which zero conversions always is). */
  hiCents: number | null;
  /** Width of the credible interval, as a fraction (0.95 = 95%). */
  credibleMass: number;
  verdict: CacVerdict;
  /**
   * Roughly how many more conversions, at the current observed rate, before
   * the interval would clear the target. Null when already decided, or when
   * there is no rate to project from.
   */
  conversionsNeeded: number | null;
};

export type CacInput = {
  conversions: number;
  spendCents: number;
  targetCacCents?: number | null;
  credibleMass?: number;
  priorShape?: number;
  priorRate?: number;
};

const DEFAULT_PRIOR_SHAPE = 0.5;
const DEFAULT_PRIOR_RATE = 0;
const DEFAULT_CREDIBLE_MASS = 0.95;
/** Cap on the projection search, so a hopeless ad does not loop forever. */
const MAX_PROJECTED_CONVERSIONS = 500;

// ---------------------------------------------------------------------------
// Special functions
//
// Implemented here rather than pulled from a dependency: it is ~80 lines, it
// must be deterministic across environments, and a statistics library is a
// large surface to trust for two functions.
// ---------------------------------------------------------------------------

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** Natural log of the gamma function (Lanczos approximation). */
export function logGamma(x: number): number {
  if (x < 0.5) {
    // Reflection, so the approximation is only ever used for x >= 0.5.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let sum = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) {
    sum += LANCZOS[i]! / (z + i + 1);
  }
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

/**
 * Lower regularized incomplete gamma P(a, x) — the CDF of Gamma(a, 1).
 *
 * Series expansion converges quickly below the mean, continued fraction above
 * it; using each only where it converges is what keeps this accurate in the
 * tails, which is exactly where small-sample intervals live.
 */
export function regularizedGammaP(a: number, x: number): number {
  if (!(a > 0)) throw new Error("regularizedGammaP: shape must be positive");
  if (x <= 0) return 0;
  if (!Number.isFinite(x)) return 1;

  const logPrefix = -x + a * Math.log(x) - logGamma(a);

  if (x < a + 1) {
    // Series: P(a,x) = e^(-x) x^a / Γ(a) · Σ x^n / (a(a+1)...(a+n))
    let term = 1 / a;
    let sum = term;
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
    }
    return Math.min(1, Math.max(0, sum * Math.exp(logPrefix)));
  }

  // Continued fraction for Q(a,x) = 1 - P(a,x), modified Lentz.
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;

  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }

  const q = Math.exp(logPrefix) * h;
  return Math.min(1, Math.max(0, 1 - q));
}

/**
 * Quantile of Gamma(a, rate = 1): the x with P(a, x) = p.
 *
 * Bisection on a bracketed root. Slower than Newton, but it cannot diverge,
 * and this runs a handful of times per ad, not per row.
 */
export function gammaQuantile(p: number, a: number): number {
  if (!(a > 0)) throw new Error("gammaQuantile: shape must be positive");
  if (p <= 0) return 0;
  if (p >= 1) return Number.POSITIVE_INFINITY;

  // Expand the upper bracket until it overshoots p.
  let hi = Math.max(a, 1);
  for (let i = 0; i < 200 && regularizedGammaP(a, hi) < p; i++) hi *= 2;

  let lo = 0;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (regularizedGammaP(a, mid) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-12 * Math.max(1, hi)) break;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// CAC estimation
// ---------------------------------------------------------------------------

function verdictFor(
  loCents: number,
  hiCents: number | null,
  targetCacCents: number | null | undefined,
): CacVerdict {
  if (targetCacCents === null || targetCacCents === undefined) return "NO_TARGET";
  if (hiCents !== null && hiCents < targetCacCents) return "LIKELY_GOOD";
  if (loCents > targetCacCents) return "LIKELY_BAD";
  return "TOO_EARLY";
}

/**
 * Estimate CAC with a credible interval and a verdict against the target.
 *
 * @throws if given a negative or fractional conversion count, or negative
 *   spend — silently coercing those would produce a confident wrong answer.
 */
export function cacEstimate(input: CacInput): CacEstimate {
  const {
    conversions,
    spendCents,
    targetCacCents,
    credibleMass = DEFAULT_CREDIBLE_MASS,
    priorShape = DEFAULT_PRIOR_SHAPE,
    priorRate = DEFAULT_PRIOR_RATE,
  } = input;

  if (!Number.isInteger(conversions) || conversions < 0) {
    throw new Error(`cacEstimate: conversions must be a non-negative integer, got ${conversions}`);
  }
  if (!Number.isFinite(spendCents) || spendCents < 0) {
    throw new Error(`cacEstimate: spendCents must be non-negative, got ${spendCents}`);
  }
  if (!(credibleMass > 0 && credibleMass < 1)) {
    throw new Error(`cacEstimate: credibleMass must be in (0,1), got ${credibleMass}`);
  }

  const base: Omit<CacEstimate, "verdict" | "conversionsNeeded"> = {
    conversions,
    spendCents,
    pointCents: null,
    loCents: null,
    hiCents: null,
    credibleMass,
  };

  // No spend means no cost to divide: there is nothing to estimate.
  if (spendCents === 0) {
    return { ...base, verdict: "NO_DATA", conversionsNeeded: null };
  }

  const spend = spendCents / 100;
  const shape = priorShape + conversions;
  const rate = priorRate + spend;

  // The point estimate is plain observed CAC — spend divided by conversions —
  // not the posterior mean.
  //
  // The posterior mean is shrunk by the prior's half a phantom conversion,
  // which at n=2 reports $248 for an ad that visibly cost $310 per conversion.
  // A number the user cannot reproduce by dividing two numbers they can see
  // costs more trust than the small statistical gain is worth. Uncertainty is
  // communicated by the interval, which is where it belongs.
  const pointCents = conversions > 0 ? Math.round(spendCents / conversions) : null;

  const tail = (1 - credibleMass) / 2;
  const lambdaHi = gammaQuantile(1 - tail, shape) / rate;
  const lambdaLo = gammaQuantile(tail, shape) / rate;

  // Inverting swaps the ends: the fastest conversion rate gives the cheapest CAC.
  const loCents = Math.round((1 / lambdaHi) * 100);
  const hiCents = lambdaLo > 0 ? Math.round((1 / lambdaLo) * 100) : null;

  const verdict = verdictFor(loCents, hiCents, targetCacCents);

  return {
    ...base,
    pointCents,
    loCents,
    hiCents,
    verdict,
    conversionsNeeded:
      verdict === "TOO_EARLY" && pointCents !== null
        ? projectConversionsNeeded({
            conversions,
            pointCents,
            targetCacCents: targetCacCents!,
            credibleMass,
            priorShape,
            priorRate,
          })
        : null,
  };
}

/**
 * How many more conversions, if the ad keeps performing exactly as it has,
 * before the interval clears the target either way.
 *
 * Holds the point estimate fixed and grows the sample, which is the honest
 * reading of "keeps performing as it has". Returns null with no conversions,
 * since there is no observed rate to extrapolate from.
 */
function projectConversionsNeeded(args: {
  conversions: number;
  pointCents: number;
  targetCacCents: number;
  credibleMass: number;
  priorShape: number;
  priorRate: number;
}): number | null {
  const { conversions, pointCents, targetCacCents, credibleMass, priorShape, priorRate } = args;
  if (conversions === 0 || pointCents <= 0) return null;

  for (let extra = 1; extra <= MAX_PROJECTED_CONVERSIONS; extra++) {
    const n = conversions + extra;
    // Spend that would keep the observed CAC unchanged at this sample size.
    const projectedSpendCents = Math.round(pointCents * n);

    const spend = projectedSpendCents / 100;
    const shape = priorShape + n;
    const rate = priorRate + spend;

    const tail = (1 - credibleMass) / 2;
    const lo = Math.round((rate / gammaQuantile(1 - tail, shape)) * 100);
    const lambdaLo = gammaQuantile(tail, shape) / rate;
    const hi = lambdaLo > 0 ? Math.round((1 / lambdaLo) * 100) : null;

    if (verdictFor(lo, hi, targetCacCents) !== "TOO_EARLY") return extra;
  }

  return null;
}
