import { describe, expect, it } from "vitest";

import {
  ACQUISITION_EVENTS,
  REVENUE_EVENTS,
  percentChange,
  previousRange,
  resolveModel,
  resolveRange,
} from "@/lib/reporting/range";

const NOW = new Date("2026-11-09T15:30:00.000Z");

describe("resolveRange", () => {
  it("includes today and the preceding days", () => {
    const r = resolveRange("7d", NOW);
    expect(r.from.toISOString()).toBe("2026-11-03T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-11-09T23:59:59.999Z");
    expect(r.days).toBe(7);
  });

  it("covers exactly the number of days named", () => {
    for (const key of ["7d", "30d", "90d"] as const) {
      const r = resolveRange(key, NOW);
      const spanDays = (r.to.getTime() - r.from.getTime() + 1) / 86_400_000;
      expect(Math.round(spanDays)).toBe(r.days);
    }
  });

  it("falls back to the default for anything unrecognised", () => {
    expect(resolveRange(undefined, NOW).key).toBe("30d");
    expect(resolveRange("all-time", NOW).key).toBe("30d");
    expect(resolveRange("'; drop table", NOW).key).toBe("30d");
  });
});

describe("previousRange", () => {
  it("sits immediately before the current window without overlapping", () => {
    const current = resolveRange("7d", NOW);
    const prior = previousRange(current);

    expect(prior.to.getTime()).toBeLessThan(current.from.getTime());
    expect(prior.days).toBe(current.days);
    // Ends the instant before the current window opens.
    expect(current.from.getTime() - prior.to.getTime()).toBe(1);
  });

  it("covers the same number of days, so the comparison is fair", () => {
    const current = resolveRange("30d", NOW);
    const prior = previousRange(current);
    const span = (prior.to.getTime() - prior.from.getTime() + 1) / 86_400_000;
    expect(Math.round(span)).toBe(30);
  });
});

describe("conversion taxonomy", () => {
  it("never counts an event as both an acquisition and revenue", () => {
    // Overlap would double count a customer and halve every CAC.
    const overlap = ACQUISITION_EVENTS.filter((e) => REVENUE_EVENTS.includes(e));
    expect(overlap).toEqual([]);
  });

  it("treats a subscription as revenue, not as a new acquisition", () => {
    expect(ACQUISITION_EVENTS).not.toContain("SUBSCRIPTION");
    expect(REVENUE_EVENTS).toContain("SUBSCRIPTION");
  });
});

describe("resolveModel", () => {
  it("defaults to last click", () => {
    expect(resolveModel(undefined)).toBe("LAST_CLICK");
    expect(resolveModel("nonsense")).toBe("LAST_CLICK");
  });

  it("accepts every real model", () => {
    expect(resolveModel("TIME_DECAY")).toBe("TIME_DECAY");
    expect(resolveModel("POSITION_BASED")).toBe("POSITION_BASED");
  });
});

describe("percentChange", () => {
  it("computes a change", () => {
    expect(percentChange(120, 100)).toBeCloseTo(20);
    expect(percentChange(80, 100)).toBeCloseTo(-20);
  });

  it("returns null against a zero baseline rather than Infinity", () => {
    // "+Infinity%" is not a thing to show a person.
    expect(percentChange(50, 0)).toBeNull();
  });
});
