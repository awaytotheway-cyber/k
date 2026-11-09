import { z } from "zod";

import { attributeConversion } from "@/lib/attribution/engine";
import { bearerToken, hashApiKey } from "@/lib/api-keys";
import { db } from "@/lib/db";
import { conversionDedupeKey } from "@/lib/dedupe";
import { safeTimestamp } from "@/lib/ingest";

/**
 * Server-side conversion ingest.
 *
 * Unlike the browser pixel, this validates strictly and answers with real
 * status codes. The caller is a backend that can read the response, retry, and
 * fix its payload — and silently accepting a malformed conversion would put
 * wrong revenue into someone's reports, which is worse than a 400.
 *
 * Idempotent: the same conversion sent twice returns the original, so webhook
 * retries are safe.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** Your name for the event, e.g. "trial_started". */
  eventName: z.string().min(1).max(120),

  eventType: z
    .enum([
      "SIGNUP",
      "TRIAL",
      "DEMO",
      "QUALIFIED",
      "PURCHASE",
      "SUBSCRIPTION",
      "EXPANSION",
      "CHURN",
      "CUSTOM",
    ])
    .default("CUSTOM"),

  /**
   * Money is accepted only in cents, never as a decimal.
   *
   * "value: 99.9" is ambiguous in a way that quietly loses or invents money
   * across a quarter, and no amount of documentation prevents the mistake.
   * Requiring an integer number of cents makes the unit impossible to get
   * wrong by accident.
   */
  valueCents: z.number().int().min(0).max(1_000_000_000).default(0),
  mrrCents: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  currency: z.string().length(3).toUpperCase().default("USD"),

  /** When it happened. Defaults to now. */
  occurredAt: z.string().max(40).optional().nullable(),

  /** Who converted. At least one of these makes the conversion attributable. */
  email: z.string().email().max(320).optional().nullable(),
  /** Your own user or account id, matching what you passed to identify(). */
  externalId: z.string().max(128).optional().nullable(),
  /** The cookie value from window.trueroas.visitorId(). The strongest link. */
  visitorId: z.string().max(128).optional().nullable(),

  /** Anything else you want kept with the conversion. */
  properties: z.record(z.string(), z.unknown()).optional().nullable(),
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  // --- authenticate --------------------------------------------------------
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) {
    return json(
      { error: "missing_api_key", message: "Send your key as: Authorization: Bearer tr_live_…" },
      401,
    );
  }

  const apiKey = await db.apiKey.findUnique({
    where: { hashedKey: hashApiKey(token) },
    select: {
      id: true,
      revokedAt: true,
      workspaceId: true,
      workspace: { select: { id: true, currency: true } },
    },
  });

  if (!apiKey || apiKey.revokedAt) {
    return json({ error: "invalid_api_key", message: "That key is not valid." }, 401);
  }

  // --- validate ------------------------------------------------------------
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "invalid_json", message: "Body must be JSON." }, 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      {
        error: "invalid_body",
        message: "One or more fields are invalid.",
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          problem: i.message,
        })),
      },
      400,
    );
  }

  const body = parsed.data;
  const workspaceId = apiKey.workspaceId;
  const occurredAt = safeTimestamp(body.occurredAt ?? undefined);

  // --- find who this was ---------------------------------------------------
  // In order of how reliably each identifies the same browser that clicked
  // the ad. The cookie id is exact; an email only matches if identify() has
  // already run for that person.
  const email = body.email?.trim().toLowerCase() ?? null;

  const visitor = await db.visitor.findFirst({
    where: {
      workspaceId,
      OR: [
        ...(body.visitorId ? [{ anonId: body.visitorId }] : []),
        ...(body.externalId ? [{ externalId: body.externalId }] : []),
        ...(email ? [{ identifiedEmail: email }] : []),
      ],
    },
    // Prefer the most recently active match when an email maps to several
    // anonymous browsers (work laptop, phone).
    orderBy: { lastSeenAt: "desc" },
    select: { id: true },
  });

  const dedupeKey = conversionDedupeKey({
    workspaceId,
    eventName: body.eventName,
    occurredAt,
    externalId: body.externalId,
    email,
  });

  // --- store ---------------------------------------------------------------
  const existing = await db.conversion.findUnique({
    where: { dedupeKey },
    select: { id: true },
  });

  if (existing) {
    // A retry of something we already have. Report success without duplicating.
    return json({ id: existing.id, duplicate: true, attributedTouches: 0 }, 200);
  }

  let conversionId: string;
  try {
    const created = await db.conversion.create({
      data: {
        workspaceId,
        visitorId: visitor?.id ?? null,
        eventName: body.eventName,
        eventType: body.eventType,
        occurredAt,
        valueCents: body.valueCents,
        mrrCents: body.mrrCents ?? null,
        currency: body.currency || apiKey.workspace.currency,
        email,
        externalId: body.externalId ?? null,
        source: "API",
        dedupeKey,
        // Cast is safe: zod has already proved this is a plain JSON object,
        // which Prisma's InputJsonValue cannot express structurally.
        rawPayload: (body.properties ?? undefined) as never,
      },
      select: { id: true },
    });
    conversionId = created.id;
  } catch {
    // Two identical requests raced each other to the unique index.
    const raced = await db.conversion.findUnique({
      where: { dedupeKey },
      select: { id: true },
    });
    if (raced) return json({ id: raced.id, duplicate: true, attributedTouches: 0 }, 200);
    return json({ error: "store_failed", message: "Could not record the conversion." }, 500);
  }

  // --- attribute -----------------------------------------------------------
  // Inline rather than queued: it is one indexed read of this visitor's
  // touches, and the caller should see an attributed conversion immediately.
  let attributedTouches = 0;
  try {
    attributedTouches = await attributeConversion(conversionId);
  } catch (error) {
    // The conversion is recorded and the backfill can fix credit later.
    // Losing the conversion because attribution failed would be worse.
    console.error("[conversions] attribution failed for", conversionId, error);
  }

  db.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return json(
    {
      id: conversionId,
      duplicate: false,
      matchedVisitor: visitor !== null,
      attributedTouches: attributedTouches / 5, // rows are written per model
    },
    201,
  );
}
