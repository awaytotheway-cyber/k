import { describe, expect, it } from "vitest";

import { conversionDedupeKey } from "@/lib/dedupe";

const base = {
  workspaceId: "ws_1",
  eventName: "trial_started",
  occurredAt: new Date("2026-11-09T12:00:30.000Z"),
};

describe("conversionDedupeKey", () => {
  describe("with an external id", () => {
    it("is stable across calls", () => {
      const a = conversionDedupeKey({ ...base, externalId: "sub_123" });
      const b = conversionDedupeKey({ ...base, externalId: "sub_123" });
      expect(a).toBe(b);
    });

    it("ignores timing entirely", () => {
      // A webhook retried an hour later is the same conversion.
      const a = conversionDedupeKey({ ...base, externalId: "sub_123" });
      const b = conversionDedupeKey({
        ...base,
        externalId: "sub_123",
        occurredAt: new Date("2026-11-09T13:30:00.000Z"),
      });
      expect(a).toBe(b);
    });

    it("separates different external ids", () => {
      expect(conversionDedupeKey({ ...base, externalId: "sub_1" })).not.toBe(
        conversionDedupeKey({ ...base, externalId: "sub_2" }),
      );
    });

    it("separates different event names for the same object", () => {
      // One subscription produces both a trial and a payment.
      expect(
        conversionDedupeKey({ ...base, eventName: "trial_started", externalId: "sub_1" }),
      ).not.toBe(
        conversionDedupeKey({ ...base, eventName: "subscription_started", externalId: "sub_1" }),
      );
    });

    it("never collides across workspaces", () => {
      // Two customers can both have a Stripe object called sub_123.
      expect(conversionDedupeKey({ ...base, externalId: "sub_123" })).not.toBe(
        conversionDedupeKey({ ...base, workspaceId: "ws_2", externalId: "sub_123" }),
      );
    });

    it("prefers the external id over the email", () => {
      const withEmail = conversionDedupeKey({
        ...base,
        externalId: "sub_1",
        email: "jane@acme.com",
      });
      const withoutEmail = conversionDedupeKey({ ...base, externalId: "sub_1" });
      expect(withEmail).toBe(withoutEmail);
    });
  });

  describe("with an email and no external id", () => {
    it("collapses duplicates fired in the same minute", () => {
      // A double-submitted signup form.
      const a = conversionDedupeKey({ ...base, email: "jane@acme.com" });
      const b = conversionDedupeKey({
        ...base,
        email: "jane@acme.com",
        occurredAt: new Date("2026-11-09T12:00:58.000Z"),
      });
      expect(a).toBe(b);
    });

    it("keeps genuine repeat events in later minutes", () => {
      const a = conversionDedupeKey({ ...base, email: "jane@acme.com" });
      const b = conversionDedupeKey({
        ...base,
        email: "jane@acme.com",
        occurredAt: new Date("2026-11-09T12:01:05.000Z"),
      });
      expect(a).not.toBe(b);
    });

    it("normalises case and surrounding whitespace", () => {
      const a = conversionDedupeKey({ ...base, email: "jane@acme.com" });
      const b = conversionDedupeKey({ ...base, email: "  JANE@Acme.COM " });
      expect(a).toBe(b);
    });

    it("separates different people", () => {
      expect(conversionDedupeKey({ ...base, email: "jane@acme.com" })).not.toBe(
        conversionDedupeKey({ ...base, email: "amir@acme.com" }),
      );
    });
  });

  describe("with neither", () => {
    it("produces a unique key every time, so nothing is silently merged", () => {
      // Without an identifier we cannot tell a duplicate from a real second
      // conversion. Dropping a real one is worse than storing a duplicate.
      const a = conversionDedupeKey({ ...base });
      const b = conversionDedupeKey({ ...base });
      expect(a).not.toBe(b);
    });
  });

  it("returns a bounded, index-friendly key", () => {
    const key = conversionDedupeKey({ ...base, externalId: "x".repeat(10_000) });
    expect(key.length).toBeLessThanOrEqual(80);
    expect(key).toMatch(/^[a-z0-9:_-]+$/i);
  });
});
