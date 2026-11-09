/**
 * API keys for the server-side conversion endpoint.
 *
 * Only a SHA-256 hash is stored. The plaintext is shown once, at creation, and
 * cannot be recovered afterwards — which is the point: a leaked database does
 * not hand over the ability to write conversions into customers' workspaces.
 *
 * SHA-256 rather than bcrypt here, unlike passwords: these keys carry 190+ bits
 * of entropy, so there is no dictionary to attack, and the endpoint has to
 * verify one on every request.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const API_KEY_PREFIX = "tr_live_";

/** Characters shown in the UI so a key is recognisable in a list. */
const DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 6;

export type GeneratedApiKey = {
  /** Shown to the user exactly once. */
  plaintext: string;
  /** What we store. */
  hashedKey: string;
  /** What we display later, e.g. "tr_live_a1b2c3". */
  prefix: string;
};

export function generateApiKey(): GeneratedApiKey {
  // 32 bytes -> 43 base64url characters, ~256 bits.
  const entropy = randomBytes(32).toString("base64url").replace(/-/g, "_");
  const plaintext = `${API_KEY_PREFIX}${entropy}`;

  return {
    plaintext,
    hashedKey: hashApiKey(plaintext),
    prefix: keyDisplayPrefix(plaintext),
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function keyDisplayPrefix(plaintext: string): string {
  return plaintext.slice(0, DISPLAY_PREFIX_LENGTH);
}

/** Constant-time comparison, so a timing signal cannot be used to walk a hash. */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Pull the key out of an `Authorization: Bearer …` header. */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}
