import { z } from "zod";

import { db } from "@/lib/db";
import { corsPreflight, noContent, readJsonBody } from "@/lib/ingest";

/**
 * Attach a known identity to an anonymous visitor.
 *
 * This is the anonymous-to-known stitch: once someone gives you an email, the
 * ad clicks they made before signing up become attributable to the revenue
 * they later produce.
 *
 * Like /collect, it always answers 204 — it is called from a beacon on a
 * customer's page that cannot act on an error.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  k: z.string().min(10).max(64),
  v: z.string().min(8).max(128),
  // A malformed email drops that field, not the call: the external id may
  // still be usable on its own.
  e: z.string().email().max(320).nullish().catch(null),
  x: z.string().max(128).nullish().catch(null),
});

export async function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  const body = await readJsonBody<unknown>(request);
  if (!body) return noContent();

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return noContent();

  const { k: pixelKey, v: anonId, e: email, x: externalId } = parsed.data;
  if (!email && !externalId) return noContent();

  const workspace = await db.workspace.findUnique({
    where: { pixelKey },
    select: { id: true },
  });
  if (!workspace) return noContent();

  const now = new Date();
  const identifiedEmail = email?.trim().toLowerCase() ?? undefined;

  await db.visitor.upsert({
    where: { workspaceId_anonId: { workspaceId: workspace.id, anonId } },
    create: {
      workspaceId: workspace.id,
      anonId,
      identifiedEmail: identifiedEmail ?? null,
      externalId: externalId ?? null,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      // Only ever fill in identity, never clear it: a later anonymous call
      // must not erase an email we already learned.
      ...(identifiedEmail ? { identifiedEmail } : {}),
      ...(externalId ? { externalId } : {}),
      lastSeenAt: now,
    },
  });

  return noContent();
}
