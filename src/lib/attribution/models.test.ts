import { describe, expect, it } from "vitest";

import { allocateCents, creditFractions, type TouchPoint } from "@/lib/attribution/models";

const CONVERTED_AT = new Date("2026-11-09T12:00:00.000Z");

/** Touches `hoursBefore` the conversion, oldest first. */
function path(...hoursBefore: number[]): TouchPoint[] {
  return hoursBefore.map((h, i) => ({
    id: `t${i}`,
    occurredAt: new Date(CONVERTED_AT.getTime() - h * 3_600_000),
  }));
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("creditFractions", () => {
  const shapes: Array<[string, TouchPoint[]]> = [
    ["single touch", path(5)],
    ["two touches", path(48, 2)],
    ["three touches", path(240, 48, 1)],
    ["long path", path(...Array.from({ length: 50 }, (_, i) => 50 - i))],
    ["simultaneous touches", path(3, 3, 3)],
  ];

  // The invariant the whole system rests on: credit is conserved. If this
  // breaks, revenue is invented or lost in every report.
  for (const model of [
    "LAST_CLICK",
    "FIRST_CLICK",
    "LINEAR",
    "TIME_DECAY",
    "POSITION_BASED",
  ] as const) {
    for (const [label, touches] of shapes) {
      it(`${model} fractions sum to 1 — ${label}`, () => {
        const fractions = creditFractions(touches, model, CONVERTED_AT);
        expect(fractions).toHaveLength(touches.length);
        expect(sum(fractions)).toBeCloseTo(1, 10);
        expect(fractions.every((f) => f >= 0)).toBe(true);
      });
    }
  }

  it("returns nothing for an empty path", () => {
    expect(creditFractions([], "LINEAR", CONVERTED_AT)).toEqual([]);
  });

  it("LAST_CLICK gives everything to the most recent touch", () => {
    expect(creditFractions(path(240, 48, 1), "LAST_CLICK", CONVERTED_AT)).toEqual([0, 0, 1]);
  });

  it("FIRST_CLICK gives everything to the earliest touch", () => {
    expect(creditFractions(path(240, 48, 1), "FIRST_CLICK", CONVERTED_AT)).toEqual([1, 0, 0]);
  });

  it("LINEAR splits evenly", () => {
    const f = creditFractions(path(240, 48, 1), "LINEAR", CONVERTED_AT);
    expect(f).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  describe("POSITION_BASED", () => {
    it("is 40/20/40 across first, middle and last", () => {
      const f = creditFractions(path(240, 120, 48, 1), "POSITION_BASED", CONVERTED_AT);
      expect(f[0]).toBeCloseTo(0.4, 10);
      expect(f[3]).toBeCloseTo(0.4, 10);
      // The 20% middle share is split between the two middle touches.
      expect(f[1]).toBeCloseTo(0.1, 10);
      expect(f[2]).toBeCloseTo(0.1, 10);
    });

    it("splits evenly with two touches, since both are first and last", () => {
      expect(creditFractions(path(48, 1), "POSITION_BASED", CONVERTED_AT)).toEqual([0.5, 0.5]);
    });

    it("gives a lone touch everything", () => {
      expect(creditFractions(path(1), "POSITION_BASED", CONVERTED_AT)).toEqual([1]);
    });

    it("gives the single middle touch the whole middle share", () => {
      const f = creditFractions(path(240, 48, 1), "POSITION_BASED", CONVERTED_AT);
      expect(f[1]).toBeCloseTo(0.2, 10);
    });
  });

  describe("TIME_DECAY", () => {
    it("halves the weight for each half-life of distance", () => {
      // 7-day half-life: a touch 7 days out should weigh half of one at t=0.
      const f = creditFractions(path(168, 0), "TIME_DECAY", CONVERTED_AT);
      expect(f[1] / f[0]).toBeCloseTo(2, 6);
    });

    it("favours recent touches", () => {
      const f = creditFractions(path(720, 168, 1), "TIME_DECAY", CONVERTED_AT);
      expect(f[0]).toBeLessThan(f[1]);
      expect(f[1]).toBeLessThan(f[2]);
    });

    it("splits evenly when all touches are simultaneous", () => {
      const f = creditFractions(path(5, 5, 5), "TIME_DECAY", CONVERTED_AT);
      expect(f[0]).toBeCloseTo(1 / 3, 10);
      expect(f[1]).toBeCloseTo(1 / 3, 10);
      expect(f[2]).toBeCloseTo(1 / 3, 10);
    });

    it("does not produce NaN when every touch is far older than the half-life", () => {
      // Naive 2^-x weights underflow to zero and normalising gives 0/0.
      const f = creditFractions(path(24_000, 24_010), "TIME_DECAY", CONVERTED_AT);
      expect(sum(f)).toBeCloseTo(1, 10);
      expect(f.every((x) => Number.isFinite(x))).toBe(true);
    });

    it("treats a touch after the conversion as same-moment, not negative-age", () => {
      // Clock skew between a browser and our server can produce this.
      const f = creditFractions(path(2, -1), "TIME_DECAY", CONVERTED_AT);
      expect(sum(f)).toBeCloseTo(1, 10);
      expect(f.every((x) => x >= 0)).toBe(true);
    });
  });
});

describe("allocateCents", () => {
  it("allocates proportionally when it divides evenly", () => {
    expect(allocateCents(1000, [0.5, 0.5])).toEqual([500, 500]);
  });

  it("conserves every cent when the split is not exact", () => {
    // 1/3 of 100 cents cannot be split evenly; largest remainder decides.
    const parts = allocateCents(100, [1 / 3, 1 / 3, 1 / 3]);
    expect(sum(parts)).toBe(100);
    expect(parts.every((p) => p === 33 || p === 34)).toBe(true);
  });

  it("conserves cents across a long awkward path", () => {
    const fractions = Array.from({ length: 7 }, () => 1 / 7);
    const parts = allocateCents(9_999, fractions);
    expect(sum(parts)).toBe(9_999);
  });

  it("gives leftover cents to the largest remainders, not the first entries", () => {
    // 0.5 / 0.25 / 0.25 of 101c => 50.5 / 25.25 / 25.25. The extra cent goes
    // to the .5 remainder, not simply to index 0.
    expect(allocateCents(101, [0.5, 0.25, 0.25])).toEqual([51, 25, 25]);
  });

  it("handles zero value", () => {
    expect(allocateCents(0, [0.4, 0.6])).toEqual([0, 0]);
  });

  it("handles an empty path", () => {
    expect(allocateCents(500, [])).toEqual([]);
  });

  it("puts everything on a single touch", () => {
    expect(allocateCents(777, [1])).toEqual([777]);
  });

  it("never returns a negative allocation", () => {
    const parts = allocateCents(7, [0.9999, 0.0001]);
    expect(parts.every((p) => p >= 0)).toBe(true);
    expect(sum(parts)).toBe(7);
  });
});
