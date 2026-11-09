/**
 * Idempotency keys for conversions.
 *
 * Conversions arrive from webhooks that retry, SDKs that fire twice, and forms
 * that get double-submitted. The database has a unique index on `dedupeKey`,
 * so the key is what decides whether a second delivery is the same conversion
 * or a new one.
 *
 * The bias is deliberate and asymmetric: merging two genuine conversions loses
 * revenue from the report permanently, while storing a duplicate is visible
 * and fixable. So when there is nothing reliable to key on, we do not guess —
 * we generate a unique key and let the row through.
 */
import { createHash, randomUUID } from "node:crypto";

export type DedupeInput = {
  workspaceId: string;
  eventName: string;
  occurredAt: Date;
  /** The caller's own id for the thing that converted. The strongest signal. */
  externalId?: string | null;
  email?: string | null;
};

function hash(parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 40);
}

export function conversionDedupeKey(input: DedupeInput): string {
  const { workspaceId, eventName, externalId, email, occurredAt } = input;

  // 1. An external id is authoritative. Timing is irrelevant: a webhook
  //    retried an hour later describes the same conversion.
  if (externalId && externalId.trim().length > 0) {
    return `ext:${hash([workspaceId, eventName, externalId.trim()])}`;
  }

  // 2. An email plus a one-minute bucket catches double submits without
  //    merging a trial and the upgrade that follows it.
  const normalizedEmail = email?.trim().toLowerCase();
  if (normalizedEmail) {
    const minuteBucket = Math.floor(occurredAt.getTime() / 60_000);
    return `em:${hash([workspaceId, eventName, normalizedEmail, String(minuteBucket)])}`;
  }

  // 3. Nothing to key on. A unique value means this row is always stored.
  return `uniq:${hash([workspaceId, eventName, randomUUID()])}`;
}
