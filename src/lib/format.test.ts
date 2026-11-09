import { describe, expect, it } from "vitest";

import { formatCacRange, formatCents, formatCompactCents, verdictLabel } from "@/lib/format";
import type { CacEstimate } from "@/lib/stats/confidence";

function estimate(partial: Partial<CacEstimate>): CacEstimate {
  return {
    conversions: 10,
    spendCents: 100_000,
    pointCents: 10_000,
    loCents: 6_000,
    hiCents: 18_000,
    credibleMass: 0.95,
    verdict: "NO_TARGET",
    conversionsNeeded: null,
    ...partial,
  };
}

describe("formatCents", () => {
  it("formats whole dollars without noise", () => {
    expect(formatCents(9_400)).toBe("$94");
    expect(formatCents(0)).toBe("$0");
    expect(formatCents(123_456_700)).toBe("$1,234,567");
  });

  it("shows cents only when asked", () => {
    expect(formatCents(9_450, { precise: true })).toBe("$94.50");
  });

  it("renders null as an em dash, not as zero", () => {
    // Zero spend and unknown spend mean very different things.
    expect(formatCents(null)).toBe("—");
  });

  it("handles negative values", () => {
    expect(formatCents(-2_500)).toBe("-$25");
  });

  it("respects currency", () => {
    expect(formatCents(9_400, { currency: "EUR" })).toContain("94");
  });
});

describe("formatCompactCents", () => {
  it("abbreviates large amounts", () => {
    expect(formatCompactCents(8_270_200)).toBe("$82.7k");
    expect(formatCompactCents(150_000_000)).toBe("$1.5M");
  });

  it("leaves small amounts alone", () => {
    expect(formatCompactCents(9_400)).toBe("$94");
    expect(formatCompactCents(99_900)).toBe("$999");
  });

  it("renders null as an em dash", () => {
    expect(formatCompactCents(null)).toBe("—");
  });
});

describe("formatCacRange", () => {
  it("renders a normal interval", () => {
    expect(formatCacRange(estimate({ loCents: 5_400, hiCents: 17_700 }))).toBe("$54–$177");
  });

  it("refuses to print a meaningless ceiling when there are no conversions", () => {
    // The bound exists mathematically but is an artifact of the prior.
    // Printing "$54–$1,018,258" would read as precision we do not have.
    const r = estimate({ conversions: 0, pointCents: null, loCents: 19_905, hiCents: 101_825_827 });
    expect(formatCacRange(r)).toBe("$199 and up");
  });

  it("returns an em dash when there is nothing to show", () => {
    expect(formatCacRange(estimate({ loCents: null, hiCents: null }))).toBe("—");
  });
});

describe("verdictLabel", () => {
  it("gives every verdict a label and a tone", () => {
    for (const verdict of [
      "LIKELY_GOOD",
      "LIKELY_BAD",
      "TOO_EARLY",
      "NO_DATA",
      "NO_TARGET",
    ] as const) {
      const label = verdictLabel(verdict);
      expect(label.text.length).toBeGreaterThan(0);
      expect(["success", "danger", "warning", "neutral"]).toContain(label.tone);
    }
  });

  it("does not call an untested ad bad", () => {
    // The whole point of the feature: TOO_EARLY must not read as a failure.
    expect(verdictLabel("TOO_EARLY").tone).not.toBe("danger");
  });

  it("uses plain language, not statistics jargon", () => {
    expect(verdictLabel("LIKELY_GOOD").text).toBe("Likely good");
    expect(verdictLabel("TOO_EARLY").text).toBe("Too early");
  });
});
