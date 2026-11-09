import { describe, expect, it } from "vitest";

import { daysUntil, startOfUtcDay, utcDaysAgo } from "@/lib/dates";

const NOW = new Date("2026-11-09T12:00:00.000Z");

describe("daysUntil", () => {
  it("returns null when there is no date", () => {
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil(undefined, NOW)).toBeNull();
  });

  it("counts a part-day as a full day remaining", () => {
    // 18 hours left is still "1 day left", not 0 — a trial should not read as
    // expired while the user can still use it.
    expect(daysUntil(new Date("2026-11-10T06:00:00.000Z"), NOW)).toBe(1);
  });

  it("counts whole days", () => {
    expect(daysUntil(new Date("2026-11-23T12:00:00.000Z"), NOW)).toBe(14);
  });

  it("floors at zero for dates in the past", () => {
    expect(daysUntil(new Date("2026-11-01T12:00:00.000Z"), NOW)).toBe(0);
  });

  it("returns zero exactly at expiry", () => {
    expect(daysUntil(NOW, NOW)).toBe(0);
  });
});

describe("startOfUtcDay", () => {
  it("truncates to UTC midnight", () => {
    expect(startOfUtcDay(NOW).toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });

  it("does not mutate its argument", () => {
    const input = new Date(NOW);
    startOfUtcDay(input);
    expect(input.toISOString()).toBe(NOW.toISOString());
  });
});

describe("utcDaysAgo", () => {
  it("steps back whole days from UTC midnight", () => {
    expect(utcDaysAgo(0, NOW).toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(utcDaysAgo(1, NOW).toISOString()).toBe("2026-11-08T00:00:00.000Z");
    expect(utcDaysAgo(90, NOW).toISOString()).toBe("2026-08-11T00:00:00.000Z");
  });

  it("crosses month and year boundaries", () => {
    const newYear = new Date("2027-01-02T09:30:00.000Z");
    expect(utcDaysAgo(3, newYear).toISOString()).toBe("2026-12-30T00:00:00.000Z");
  });
});
