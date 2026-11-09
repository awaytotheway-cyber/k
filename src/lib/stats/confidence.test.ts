import { describe, expect, it } from "vitest";

import {
  cacEstimate,
  gammaQuantile,
  regularizedGammaP,
} from "@/lib/stats/confidence";

const $ = (dollars: number) => Math.round(dollars * 100);

describe("regularizedGammaP", () => {
  // Reference values for the lower regularized incomplete gamma P(a, x).
  it("matches known values", () => {
    // P(1, x) = 1 - e^-x  (exponential CDF)
    expect(regularizedGammaP(1, 1)).toBeCloseTo(1 - Math.exp(-1), 8);
    expect(regularizedGammaP(1, 3)).toBeCloseTo(1 - Math.exp(-3), 8);
    // P(a, 0) = 0 for any a
    expect(regularizedGammaP(2.5, 0)).toBe(0);
    // P(0.5, x) = erf(sqrt(x)); erf(1) ≈ 0.842700792
    expect(regularizedGammaP(0.5, 1)).toBeCloseTo(0.8427007929, 7);
  });

  it("is monotonically increasing in x and approaches 1", () => {
    let previous = 0;
    for (const x of [0.5, 1, 2, 5, 10, 25, 60]) {
      const p = regularizedGammaP(3, x);
      expect(p).toBeGreaterThanOrEqual(previous);
      previous = p;
    }
    expect(regularizedGammaP(3, 200)).toBeCloseTo(1, 9);
  });
});

describe("gammaQuantile", () => {
  it("inverts regularizedGammaP", () => {
    for (const a of [0.5, 1, 2, 7.5, 40]) {
      for (const p of [0.025, 0.25, 0.5, 0.75, 0.975]) {
        const x = gammaQuantile(p, a);
        expect(regularizedGammaP(a, x)).toBeCloseTo(p, 6);
      }
    }
  });

  it("matches the exponential quantile for a = 1", () => {
    // Gamma(1,1) is Exponential(1): quantile = -ln(1-p)
    expect(gammaQuantile(0.5, 1)).toBeCloseTo(-Math.log(0.5), 6);
    expect(gammaQuantile(0.95, 1)).toBeCloseTo(-Math.log(0.05), 6);
  });

  it("handles the extremes", () => {
    expect(gammaQuantile(0, 2)).toBe(0);
    expect(gammaQuantile(1, 2)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("cacEstimate", () => {
  const target = $(180);

  it("reports no data when there is no spend", () => {
    const r = cacEstimate({ conversions: 0, spendCents: 0, targetCacCents: target });
    expect(r.verdict).toBe("NO_DATA");
    expect(r.pointCents).toBeNull();
  });

  describe("with zero conversions", () => {
    it("has no point estimate and no useful ceiling", () => {
      const r = cacEstimate({ conversions: 0, spendCents: $(500), targetCacCents: target });
      // Nothing to divide by, so no observed CAC exists.
      expect(r.pointCents).toBeNull();
      // The posterior is proper so a finite bound exists, but it is an
      // artifact of the prior's shape, not evidence — six figures on $500.
      // Callers must not print it as a number.
      expect(r.hiCents).toBeGreaterThan($(100_000));
      expect(r.conversionsNeeded).toBeNull();
    });

    it("is TOO_EARLY while spend is still small next to the target", () => {
      // $50 spent against a $180 target: absence of conversions says nothing yet.
      const r = cacEstimate({ conversions: 0, spendCents: $(50), targetCacCents: target });
      expect(r.verdict).toBe("TOO_EARLY");
    });

    it("becomes LIKELY_BAD once the silence is itself evidence", () => {
      // $500 spent with nothing to show is 2.8x the target CAC. The whole
      // credible interval now sits above target, which is a real finding and
      // not a premature one.
      const r = cacEstimate({ conversions: 0, spendCents: $(500), targetCacCents: target });
      expect(r.loCents!).toBeGreaterThan(target);
      expect(r.verdict).toBe("LIKELY_BAD");
    });
  });

  it("brackets the point estimate", () => {
    const r = cacEstimate({ conversions: 11, spendCents: $(1034), targetCacCents: target });
    expect(r.pointCents).not.toBeNull();
    expect(r.loCents!).toBeLessThan(r.pointCents!);
    expect(r.hiCents!).toBeGreaterThan(r.pointCents!);
  });

  it("reports the point estimate the user can reproduce by dividing", () => {
    // Exactly spend / conversions, not a shrunk posterior mean: $5000 / 50.
    const r = cacEstimate({ conversions: 50, spendCents: $(5000), targetCacCents: target });
    expect(r.pointCents).toBe($(100));

    // And at the small sample where shrinkage would bite hardest.
    const small = cacEstimate({ conversions: 2, spendCents: $(620), targetCacCents: target });
    expect(small.pointCents).toBe($(310));
  });

  it("narrows the interval as evidence accumulates", () => {
    // Same observed CAC of $100, increasing sample size.
    const widths = [2, 10, 50, 400].map((n) => {
      const r = cacEstimate({
        conversions: n,
        spendCents: $(100 * n),
        targetCacCents: target,
      });
      return (r.hiCents ?? Number.POSITIVE_INFINITY) - r.loCents!;
    });

    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!).toBeLessThan(widths[i - 1]!);
    }
  });

  describe("verdicts", () => {
    it("is LIKELY_GOOD when the whole interval sits below target", () => {
      const r = cacEstimate({
        conversions: 120,
        spendCents: $(120 * 90),
        targetCacCents: target,
      });
      expect(r.verdict).toBe("LIKELY_GOOD");
      expect(r.hiCents!).toBeLessThan(target);
    });

    it("is LIKELY_BAD when the whole interval sits above target", () => {
      const r = cacEstimate({
        conversions: 60,
        spendCents: $(60 * 600),
        targetCacCents: target,
      });
      expect(r.verdict).toBe("LIKELY_BAD");
      expect(r.loCents!).toBeGreaterThan(target);
    });

    it("is TOO_EARLY on two conversions, however good they look", () => {
      // This is the case the whole feature exists for: $310 CAC on n=2 is not
      // a bad ad, it is an untested one.
      const r = cacEstimate({ conversions: 2, spendCents: $(620), targetCacCents: target });
      expect(r.verdict).toBe("TOO_EARLY");
      expect(r.hiCents!).toBeGreaterThan(target);
    });

    it("is TOO_EARLY when the interval straddles the target", () => {
      const r = cacEstimate({ conversions: 5, spendCents: $(900), targetCacCents: target });
      expect(r.loCents!).toBeLessThan(target);
      expect(r.hiCents!).toBeGreaterThan(target);
      expect(r.verdict).toBe("TOO_EARLY");
    });

    it("is NO_TARGET when the workspace has not set one", () => {
      const r = cacEstimate({ conversions: 30, spendCents: $(3000) });
      expect(r.verdict).toBe("NO_TARGET");
      // The interval is still computed and useful on its own.
      expect(r.pointCents).not.toBeNull();
      expect(r.loCents).not.toBeNull();
    });

    it("flips from TOO_EARLY to a decision as data arrives", () => {
      const early = cacEstimate({ conversions: 3, spendCents: $(240), targetCacCents: target });
      const later = cacEstimate({
        conversions: 300,
        spendCents: $(24_000),
        targetCacCents: target,
      });
      expect(early.verdict).toBe("TOO_EARLY");
      expect(later.verdict).toBe("LIKELY_GOOD");
    });
  });

  describe("conversionsNeeded", () => {
    it("says how many more conversions would settle it", () => {
      const r = cacEstimate({ conversions: 2, spendCents: $(620), targetCacCents: target });
      expect(r.conversionsNeeded).toBeGreaterThan(0);
      expect(r.conversionsNeeded).toBeLessThan(500);
    });

    it("is null once a verdict is already reached", () => {
      const r = cacEstimate({
        conversions: 300,
        spendCents: $(300 * 90),
        targetCacCents: target,
      });
      expect(r.verdict).toBe("LIKELY_GOOD");
      expect(r.conversionsNeeded).toBeNull();
    });

    it("is null with no conversions, since there is no rate to project", () => {
      const r = cacEstimate({ conversions: 0, spendCents: $(500), targetCacCents: target });
      expect(r.conversionsNeeded).toBeNull();
    });

    it("projects a verdict that actually holds at the projected sample size", () => {
      const start = cacEstimate({ conversions: 4, spendCents: $(360), targetCacCents: target });
      expect(start.verdict).toBe("TOO_EARLY");

      const needed = start.conversionsNeeded!;
      const projectedN = 4 + needed;
      // Same observed CAC, more data: the verdict must now be decided.
      const projected = cacEstimate({
        conversions: projectedN,
        spendCents: Math.round((start.pointCents! * projectedN) / 1),
        targetCacCents: target,
      });
      expect(projected.verdict).not.toBe("TOO_EARLY");
    });
  });

  it("is deterministic", () => {
    const args = { conversions: 7, spendCents: $(812), targetCacCents: target } as const;
    expect(cacEstimate(args)).toEqual(cacEstimate(args));
  });

  it("rejects nonsense input rather than returning a confident wrong answer", () => {
    expect(() => cacEstimate({ conversions: -1, spendCents: $(100) })).toThrow();
    expect(() => cacEstimate({ conversions: 1.5, spendCents: $(100) })).toThrow();
    expect(() => cacEstimate({ conversions: 1, spendCents: -5 })).toThrow();
  });
});
