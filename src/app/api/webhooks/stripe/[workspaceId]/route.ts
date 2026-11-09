import { attributeConversion } from "@/lib/attribution/engine";
import { db } from "@/lib/db";
import { conversionDedupeKey } from "@/lib/dedupe";
import { verifyStripeSignature } from "@/lib/stripe-webhook";
import type { ConversionType } from "@/generated/prisma/enums";

/**
 * Conversions straight from a customer's own Stripe account.
 *
 * The fastest path to real revenue in the product: the customer adds one
 * webhook endpoint and paid subscriptions start attributing themselves, with
 * no code in their application at all.
 *
 * The workspace id is in the URL and is not a secret — the signature is what
 * authenticates the request, verified against a signing secret held per
 * workspace. Anything that fails verification is rejected before a single
 * database write.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Events worth recording. Anything else is acknowledged and ignored. */
const HANDLED = new Set([
  "invoice.paid",
  "invoice.payment_succeeded",
  "checkout.session.completed",
  "customer.subscription.created",
]);

type StripeEvent = {
  id?: string;
  type?: string;
  created?: number;
  data?: { object?: Record<string, unknown> };
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, currency: true, stripeWebhookSecret: true },
  });

  // Same answer for an unknown workspace and an unconfigured one, so the
  // endpoint cannot be used to probe which workspace ids exist.
  if (!workspace?.stripeWebhookSecret) {
    return json({ error: "not_configured" }, 404);
  }

  // The raw body is what was signed; parsing first and re-serialising would
  // change the bytes and break verification.
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyStripeSignature(raw, signature, workspace.stripeWebhookSecret)) {
    return json({ error: "invalid_signature" }, 400);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const type = event.type ?? "";
  if (!HANDLED.has(type)) {
    // Acknowledge, so Stripe does not retry something we will never want.
    return json({ received: true, ignored: type }, 200);
  }

  const object = event.data?.object ?? {};
  const email = extractEmail(object);
  const externalId = typeof object.id === "string" ? object.id : (event.id ?? null);
  const occurredAt = event.created ? new Date(event.created * 1000) : new Date();

  const { eventType, eventName, valueCents, mrrCents } = interpret(type, object);

  const dedupeKey = conversionDedupeKey({
    workspaceId: workspace.id,
    eventName,
    occurredAt,
    externalId,
    email,
  });

  const existing = await db.conversion.findUnique({
    where: { dedupeKey },
    select: { id: true },
  });
  if (existing) {
    // Stripe retries aggressively; a replay is a success, not a duplicate row.
    return json({ received: true, duplicate: true }, 200);
  }

  const visitor = email
    ? await db.visitor.findFirst({
        where: { workspaceId: workspace.id, identifiedEmail: email },
        orderBy: { lastSeenAt: "desc" },
        select: { id: true },
      })
    : null;

  let conversionId: string;
  try {
    const created = await db.conversion.create({
      data: {
        workspaceId: workspace.id,
        visitorId: visitor?.id ?? null,
        eventName,
        eventType,
        occurredAt,
        valueCents,
        mrrCents,
        currency: extractCurrency(object) ?? workspace.currency,
        email,
        externalId,
        source: "STRIPE",
        dedupeKey,
        rawPayload: { stripeEventId: event.id, stripeType: type } as never,
      },
      select: { id: true },
    });
    conversionId = created.id;
  } catch {
    const raced = await db.conversion.findUnique({ where: { dedupeKey }, select: { id: true } });
    if (raced) return json({ received: true, duplicate: true }, 200);
    // A 500 makes Stripe retry, which is what we want for a transient failure.
    return json({ error: "store_failed" }, 500);
  }

  try {
    await attributeConversion(conversionId);
  } catch (error) {
    // Keep the revenue; credit can be recomputed by the backfill.
    console.error("[stripe-webhook] attribution failed for", conversionId, error);
  }

  return json({ received: true, conversionId }, 200);
}

function extractEmail(object: Record<string, unknown>): string | null {
  const candidates = [
    object.customer_email,
    (object.customer_details as Record<string, unknown> | undefined)?.email,
    object.receipt_email,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.includes("@")) return value.trim().toLowerCase();
  }
  return null;
}

function extractCurrency(object: Record<string, unknown>): string | null {
  return typeof object.currency === "string" ? object.currency.toUpperCase() : null;
}

/**
 * Map a Stripe event to our conversion vocabulary.
 *
 * Annual plans are divided by twelve so MRR means the same thing however the
 * customer bills; otherwise one annual deal would swamp a month of monthly
 * ones and make every CAC comparison meaningless.
 */
function interpret(
  type: string,
  object: Record<string, unknown>,
): { eventType: ConversionType; eventName: string; valueCents: number; mrrCents: number | null } {
  const amount = pickAmount(object);

  if (type === "customer.subscription.created") {
    const trialing = object.status === "trialing";
    return {
      eventType: trialing ? "TRIAL" : "SUBSCRIPTION",
      eventName: trialing ? "trial_started" : "subscription_started",
      valueCents: trialing ? 0 : amount,
      mrrCents: trialing ? null : monthlyEquivalent(object, amount),
    };
  }

  if (type === "checkout.session.completed") {
    return {
      eventType: "PURCHASE",
      eventName: "checkout_completed",
      valueCents: amount,
      mrrCents: null,
    };
  }

  // invoice.paid / invoice.payment_succeeded
  return {
    eventType: "SUBSCRIPTION",
    eventName: "invoice_paid",
    valueCents: amount,
    mrrCents: monthlyEquivalent(object, amount),
  };
}

function pickAmount(object: Record<string, unknown>): number {
  for (const key of ["amount_paid", "amount_total", "amount", "total"]) {
    const value = object[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.round(value);
    }
  }
  return 0;
}

/** Normalise a billing amount to a monthly figure. */
function monthlyEquivalent(object: Record<string, unknown>, amountCents: number): number | null {
  if (amountCents <= 0) return null;

  const lines = (object.lines as { data?: Array<Record<string, unknown>> } | undefined)?.data;
  const items = (object.items as { data?: Array<Record<string, unknown>> } | undefined)?.data;
  const first = lines?.[0] ?? items?.[0];
  const price = first?.price as Record<string, unknown> | undefined;
  const recurring = price?.recurring as Record<string, unknown> | undefined;

  const interval = typeof recurring?.interval === "string" ? recurring.interval : null;
  const count =
    typeof recurring?.interval_count === "number" && recurring.interval_count > 0
      ? recurring.interval_count
      : 1;

  if (interval === "year") return Math.round(amountCents / (12 * count));
  if (interval === "week") return Math.round((amountCents * 52) / (12 * count));
  if (interval === "day") return Math.round((amountCents * 365) / (12 * count));
  if (interval === "month") return Math.round(amountCents / count);

  // No recurring information: treat it as a monthly amount rather than
  // guessing, and let the customer correct it with the API if wrong.
  return amountCents;
}
