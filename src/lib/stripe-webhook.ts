/**
 * Stripe webhook signature verification.
 *
 * Implemented here rather than via `stripe.webhooks.constructEvent` because
 * these are the *customer's* Stripe accounts, not ours: we hold a signing
 * secret per workspace and never an API key for their account. The SDK path
 * would require instantiating a client we have no credentials for.
 *
 * The scheme is Stripe's documented one: the header carries a timestamp and
 * one or more v1 signatures, each an HMAC-SHA256 over "<timestamp>.<payload>".
 *
 * This is the only thing standing between a public URL and someone writing
 * fabricated revenue into a customer's reports, so it is tested hard and fails
 * closed on anything it does not understand.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** How far a timestamp may be from now. Stripe's own default is five minutes. */
const TOLERANCE_SECONDS = 300;

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function verifyStripeSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  // An empty secret must never validate; otherwise an unconfigured workspace
  // would accept anything.
  if (!secret || !signatureHeader) return false;

  let timestamp: number | null = null;
  const candidates: string[] = [];

  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.split("=", 2);
    if (!key || !value) continue;
    if (key.trim() === "t") {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) timestamp = parsed;
    } else if (key.trim() === "v1") {
      candidates.push(value.trim());
    }
  }

  if (timestamp === null || candidates.length === 0) return false;

  // Reject anything outside the window in either direction: an old signature
  // is a replay, and a future one means a forged or badly skewed sender.
  const ageSeconds = Math.abs(nowMs / 1000 - timestamp);
  if (ageSeconds > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  // Stripe sends several v1 values during a secret rotation; any match is valid.
  return candidates.some((candidate) => constantTimeEquals(candidate, expected));
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
