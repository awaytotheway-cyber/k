/**
 * Password hashing.
 *
 * bcryptjs rather than native bcrypt: pure JS, so it builds on any host and in
 * serverless runtimes without a compile step. Cost 12 is ~250ms on modern
 * hardware — slow enough to matter for offline cracking, fast enough for login.
 */
import bcrypt from "bcryptjs";

const COST = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, COST);
}

export async function verifyPassword(
  plaintext: string,
  hash: string | null | undefined,
): Promise<boolean> {
  // Still run a comparison when the user has no password set (OAuth-only
  // account, or no such user) so that response timing does not reveal which.
  const target = hash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
  const ok = await bcrypt.compare(plaintext, target);
  return Boolean(hash) && ok;
}
