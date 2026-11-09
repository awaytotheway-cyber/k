import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { generateWebhookSecret, verifyStripeSignature } from "@/lib/stripe-webhook";

const SECRET = "whsec_test_abcdefghijklmnopqrstuvwxyz";
const PAYLOAD = '{"id":"evt_1","type":"invoice.paid"}';

function sign(payload: string, secret: string, timestamp: number): string {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

const now = 1_762_000_000;

describe("verifyStripeSignature", () => {
  it("accepts a correctly signed payload", () => {
    const header = sign(PAYLOAD, SECRET, now);
    expect(verifyStripeSignature(PAYLOAD, header, SECRET, now * 1000)).toBe(true);
  });

  it("rejects a payload that was altered after signing", () => {
    // The whole point: an attacker must not be able to post fake revenue.
    const header = sign(PAYLOAD, SECRET, now);
    const tampered = PAYLOAD.replace("evt_1", "evt_2");
    expect(verifyStripeSignature(tampered, header, SECRET, now * 1000)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const header = sign(PAYLOAD, "whsec_someone_elses_secret", now);
    expect(verifyStripeSignature(PAYLOAD, header, SECRET, now * 1000)).toBe(false);
  });

  it("rejects an old signature, so a captured request cannot be replayed", () => {
    const header = sign(PAYLOAD, SECRET, now - 3600);
    expect(verifyStripeSignature(PAYLOAD, header, SECRET, now * 1000)).toBe(false);
  });

  it("rejects a timestamp far in the future", () => {
    const header = sign(PAYLOAD, SECRET, now + 3600);
    expect(verifyStripeSignature(PAYLOAD, header, SECRET, now * 1000)).toBe(false);
  });

  it("accepts a signature inside the tolerance window", () => {
    const header = sign(PAYLOAD, SECRET, now - 120);
    expect(verifyStripeSignature(PAYLOAD, header, SECRET, now * 1000)).toBe(true);
  });

  it("accepts a header carrying several v1 signatures", () => {
    // Stripe sends more than one during a secret rotation.
    const good = createHmac("sha256", SECRET).update(`${now}.${PAYLOAD}`).digest("hex");
    const header = `t=${now},v1=0000000000000000000000000000000000000000000000000000000000000000,v1=${good}`;
    expect(verifyStripeSignature(PAYLOAD, header, SECRET, now * 1000)).toBe(true);
  });

  it("rejects malformed or missing headers rather than throwing", () => {
    for (const header of ["", "garbage", "t=abc,v1=def", `t=${now}`, `v1=abc`]) {
      expect(verifyStripeSignature(PAYLOAD, header, SECRET, now * 1000)).toBe(false);
    }
  });

  it("rejects an empty secret rather than accepting everything", () => {
    const header = sign(PAYLOAD, "", now);
    expect(verifyStripeSignature(PAYLOAD, header, "", now * 1000)).toBe(false);
  });
});

describe("generateWebhookSecret", () => {
  it("looks like a Stripe signing secret", () => {
    expect(generateWebhookSecret()).toMatch(/^whsec_[A-Za-z0-9_-]{32,}$/);
  });

  it("never repeats", () => {
    const secrets = new Set(Array.from({ length: 200 }, () => generateWebhookSecret()));
    expect(secrets.size).toBe(200);
  });
});
