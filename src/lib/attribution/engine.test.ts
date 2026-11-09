import { describe, expect, it } from "vitest";

import {
  ATTRIBUTION_MODELS,
  computeAttributionRows,
  type ConversionForAttribution,
  type TouchForAttribution,
} from "@/lib/attribution/engine";

const CONVERTED_AT = new Date("2026-11-09T12:00:00.000Z");

const conversion: ConversionForAttribution = {
  id: "cv_1",
  workspaceId: "ws_1",
  occurredAt: CONVERTED_AT,
  valueCents: 9_900,
  mrrCents: 9_900,
};

function touch(partial: Partial<TouchForAttribution> & { id: string }): TouchForAttribution {
  return {
    occurredAt: new Date(CONVERTED_AT.getTime() - 3_600_000),
    clickIdType: "GCLID",
    platform: "GOOGLE",
    adId: "ad_1",
    adSetId: "as_1",
    campaignId: "cmp_1",
    ...partial,
  };
}

const daysBefore = (n: number) => new Date(CONVERTED_AT.getTime() - n * 86_400_000);

describe("computeAttributionRows", () => {
  it("writes one row per touch per model", () => {
    const touches = [touch({ id: "t1" }), touch({ id: "t2" })];
    const rows = computeAttributionRows(conversion, touches, 90);
    expect(rows).toHaveLength(2 * ATTRIBUTION_MODELS.length);
  });

  it("conserves the conversion value within every model", () => {
    const touches = [
      touch({ id: "t1", occurredAt: daysBefore(10) }),
      touch({ id: "t2", occurredAt: daysBefore(3) }),
      touch({ id: "t3", occurredAt: daysBefore(1) }),
    ];
    const rows = computeAttributionRows(conversion, touches, 90);

    for (const model of ATTRIBUTION_MODELS) {
      const total = rows
        .filter((r) => r.model === model)
        .reduce((sum, r) => sum + r.creditedValueCents, 0);
      expect(total, `${model} must credit exactly the conversion value`).toBe(
        conversion.valueCents,
      );
    }
  });

  it("conserves MRR the same way", () => {
    const touches = [touch({ id: "t1" }), touch({ id: "t2" }), touch({ id: "t3" })];
    const rows = computeAttributionRows(conversion, touches, 90);

    for (const model of ATTRIBUTION_MODELS) {
      const total = rows
        .filter((r) => r.model === model)
        .reduce((sum, r) => sum + (r.creditedMrrCents ?? 0), 0);
      expect(total).toBe(conversion.mrrCents);
    }
  });

  it("leaves MRR null when the conversion carries none", () => {
    const rows = computeAttributionRows(
      { ...conversion, mrrCents: null },
      [touch({ id: "t1" })],
      90,
    );
    expect(rows.every((r) => r.creditedMrrCents === null)).toBe(true);
  });

  describe("which touches count", () => {
    it("ignores organic and direct visits", () => {
      const touches = [
        touch({ id: "paid", clickIdType: "FBCLID", platform: "META" }),
        touch({ id: "organic", clickIdType: "NONE", platform: "ORGANIC", adId: null }),
        touch({ id: "direct", clickIdType: "NONE", platform: "DIRECT", adId: null }),
      ];
      const rows = computeAttributionRows(conversion, touches, 90);
      const credited = new Set(rows.map((r) => r.touchId));
      expect(credited).toEqual(new Set(["paid"]));
    });

    it("counts a paid-platform touch that lost its click id", () => {
      // Privacy tooling strips click ids; the UTMs that set the platform survive.
      const rows = computeAttributionRows(
        conversion,
        [touch({ id: "t1", clickIdType: "NONE", platform: "META" })],
        90,
      );
      expect(rows.length).toBeGreaterThan(0);
    });

    it("drops touches older than the lookback window", () => {
      const touches = [
        touch({ id: "ancient", occurredAt: daysBefore(120) }),
        touch({ id: "recent", occurredAt: daysBefore(5) }),
      ];
      const rows = computeAttributionRows(conversion, touches, 90);
      expect(new Set(rows.map((r) => r.touchId))).toEqual(new Set(["recent"]));
    });

    it("drops touches that happened after the conversion", () => {
      // A later visit cannot have caused an earlier signup.
      const touches = [
        touch({ id: "before", occurredAt: daysBefore(2) }),
        touch({ id: "after", occurredAt: new Date(CONVERTED_AT.getTime() + 86_400_000) }),
      ];
      const rows = computeAttributionRows(conversion, touches, 90);
      expect(new Set(rows.map((r) => r.touchId))).toEqual(new Set(["before"]));
    });

    it("returns nothing when no touch qualifies", () => {
      const touches = [touch({ id: "organic", clickIdType: "NONE", platform: "ORGANIC" })];
      expect(computeAttributionRows(conversion, touches, 90)).toEqual([]);
    });

    it("returns nothing for a conversion with no touches at all", () => {
      expect(computeAttributionRows(conversion, [], 90)).toEqual([]);
    });
  });

  describe("ordering", () => {
    it("credits first and last click correctly regardless of input order", () => {
      // The database does not guarantee order unless we ask, so the engine
      // must sort rather than trust what it was handed.
      const touches = [
        touch({ id: "middle", occurredAt: daysBefore(5), adId: "ad_m" }),
        touch({ id: "last", occurredAt: daysBefore(1), adId: "ad_l" }),
        touch({ id: "first", occurredAt: daysBefore(30), adId: "ad_f" }),
      ];
      const rows = computeAttributionRows(conversion, touches, 90);

      const lastClick = rows.find((r) => r.model === "LAST_CLICK" && r.creditedValueCents > 0);
      const firstClick = rows.find((r) => r.model === "FIRST_CLICK" && r.creditedValueCents > 0);

      expect(lastClick?.touchId).toBe("last");
      expect(firstClick?.touchId).toBe("first");
    });
  });

  describe("denormalised fields", () => {
    it("copies the ad hierarchy and platform from the touch", () => {
      const rows = computeAttributionRows(
        conversion,
        [touch({ id: "t1", adId: "ad_9", adSetId: "as_9", campaignId: "cmp_9", platform: "META" })],
        90,
      );
      const row = rows[0]!;
      expect(row.adId).toBe("ad_9");
      expect(row.adSetId).toBe("as_9");
      expect(row.campaignId).toBe("cmp_9");
      expect(row.platform).toBe("META");
    });

    it("copies the conversion timestamp, not the touch timestamp", () => {
      // Reports group by when the money happened, not when the click did.
      const rows = computeAttributionRows(
        conversion,
        [touch({ id: "t1", occurredAt: daysBefore(30) })],
        90,
      );
      expect(rows[0]!.occurredAt).toEqual(CONVERTED_AT);
    });

    it("carries the workspace id onto every row", () => {
      const rows = computeAttributionRows(conversion, [touch({ id: "t1" })], 90);
      expect(rows.every((r) => r.workspaceId === "ws_1")).toBe(true);
    });
  });

  it("is deterministic", () => {
    const touches = [touch({ id: "t1" }), touch({ id: "t2" }), touch({ id: "t3" })];
    expect(computeAttributionRows(conversion, touches, 90)).toEqual(
      computeAttributionRows(conversion, touches, 90),
    );
  });

  it("handles a zero-value conversion without inventing credit", () => {
    // A free trial has no revenue yet but still needs its path recorded.
    const rows = computeAttributionRows(
      { ...conversion, valueCents: 0, mrrCents: null },
      [touch({ id: "t1" }), touch({ id: "t2" })],
      90,
    );
    expect(rows.length).toBe(2 * ATTRIBUTION_MODELS.length);
    expect(rows.every((r) => r.creditedValueCents === 0)).toBe(true);
  });
});
