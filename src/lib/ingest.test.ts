import { describe, expect, it } from "vitest";

import { collectPayloadSchema, deviceTypeFrom, safeTimestamp } from "@/lib/ingest";

const valid = {
  k: "pixel-key-1234567890",
  v: "visitor-abcdefgh",
  u: "https://acme.com/pricing?gclid=abc",
};

describe("collectPayloadSchema", () => {
  it("accepts a well-formed payload", () => {
    const r = collectPayloadSchema.safeParse({ ...valid, s: "session-1", t: "2026-11-09T12:00:00Z" });
    expect(r.success).toBe(true);
  });

  describe("never drops an event over non-essential metadata", () => {
    // Regression: a five-character session id once failed a min(8) rule and
    // discarded the whole page view — silently, since the beacon ignores the
    // response. Losing the link between an ad and a customer must never be
    // the cost of a bad metadata field.
    const junk: Array<[string, Record<string, unknown>]> = [
      ["short session id", { s: "s1" }],
      ["numeric session id", { s: 12345 }],
      ["session id far too long", { s: "x".repeat(500) }],
      ["unparseable timestamp", { t: "not-a-date" }],
      ["numeric timestamp", { t: 1762000000 }],
      ["non-numeric screen width", { w: "wide" }],
      ["negative screen width", { w: -5 }],
      ["referrer that is not a string", { r: { evil: true } }],
    ];

    for (const [label, extra] of junk) {
      it(`survives ${label}`, () => {
        const r = collectPayloadSchema.safeParse({ ...valid, ...extra });
        expect(r.success, `${label} must not reject the event`).toBe(true);
        if (r.success) {
          // The essentials are intact; the bad field became null.
          expect(r.data.k).toBe(valid.k);
          expect(r.data.v).toBe(valid.v);
          expect(r.data.u).toBe(valid.u);
        }
      });
    }
  });

  describe("rejects only when an essential is missing", () => {
    it("requires a pixel key", () => {
      expect(collectPayloadSchema.safeParse({ ...valid, k: undefined }).success).toBe(false);
      expect(collectPayloadSchema.safeParse({ ...valid, k: "short" }).success).toBe(false);
    });

    it("requires a visitor id", () => {
      expect(collectPayloadSchema.safeParse({ ...valid, v: undefined }).success).toBe(false);
    });

    it("requires a URL", () => {
      expect(collectPayloadSchema.safeParse({ ...valid, u: "" }).success).toBe(false);
    });
  });
});

describe("deviceTypeFrom", () => {
  it("classifies the common cases", () => {
    expect(deviceTypeFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148")).toBe("MOBILE");
    expect(deviceTypeFrom("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("TABLET");
    expect(deviceTypeFrom("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Chrome/120")).toBe(
      "DESKTOP",
    );
    expect(deviceTypeFrom("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari")).toBe("MOBILE");
  });

  it("returns UNKNOWN rather than guessing", () => {
    expect(deviceTypeFrom(null)).toBe("UNKNOWN");
    expect(deviceTypeFrom("curl/8.4.0")).toBe("UNKNOWN");
  });
});

describe("safeTimestamp", () => {
  const now = new Date("2026-11-09T12:00:00.000Z");

  it("accepts a plausible client timestamp", () => {
    const sent = "2026-11-09T11:59:30.000Z";
    expect(safeTimestamp(sent, now).toISOString()).toBe(sent);
  });

  it("falls back to our clock when the device clock is wildly wrong", () => {
    // A device set to 2019 would otherwise bury the event outside every report.
    expect(safeTimestamp("2019-01-01T00:00:00.000Z", now)).toEqual(now);
    expect(safeTimestamp("2030-01-01T00:00:00.000Z", now)).toEqual(now);
  });

  it("falls back for anything unparseable or missing", () => {
    expect(safeTimestamp("not-a-date", now)).toEqual(now);
    expect(safeTimestamp(undefined, now)).toEqual(now);
    expect(safeTimestamp(null, now)).toEqual(now);
    expect(safeTimestamp(12345, now)).toEqual(now);
  });

  it("allows small skew in either direction", () => {
    const slightlyAhead = "2026-11-09T12:00:45.000Z";
    expect(safeTimestamp(slightlyAhead, now).toISOString()).toBe(slightlyAhead);
  });
});
