/**
 * The attribution engine.
 *
 * Takes a conversion and the visitor's history, decides which ads deserve
 * credit, and writes one row per (touch, model). All five models are computed
 * eagerly rather than on read, so a dashboard query is a flat aggregate
 * instead of a graph walk — and so the Model Disagreement view costs nothing.
 *
 * `computeAttributionRows` is pure and carries the judgement. The database
 * functions below it are thin and do no arithmetic.
 */
import type { AttributionModel, ClickIdType, Platform } from "@/generated/prisma/enums";
import { allocateCents, creditFractions } from "@/lib/attribution/models";
import { isPaidTouch } from "@/lib/clickids";
import { db } from "@/lib/db";

export const ATTRIBUTION_MODELS: AttributionModel[] = [
  "LAST_CLICK",
  "FIRST_CLICK",
  "LINEAR",
  "TIME_DECAY",
  "POSITION_BASED",
];

export type ConversionForAttribution = {
  id: string;
  workspaceId: string;
  occurredAt: Date;
  valueCents: number;
  mrrCents: number | null;
};

export type TouchForAttribution = {
  id: string;
  occurredAt: Date;
  clickIdType: ClickIdType;
  platform: Platform;
  adId: string | null;
  adSetId: string | null;
  campaignId: string | null;
};

export type AttributionRow = {
  workspaceId: string;
  conversionId: string;
  touchId: string;
  model: AttributionModel;
  creditFraction: string;
  creditedValueCents: number;
  creditedMrrCents: number | null;
  occurredAt: Date;
  platform: Platform;
  adId: string | null;
  adSetId: string | null;
  campaignId: string | null;
};

/**
 * Credit rows for one conversion.
 *
 * @param lookbackDays how far back a touch may be and still count
 */
export function computeAttributionRows(
  conversion: ConversionForAttribution,
  touches: TouchForAttribution[],
  lookbackDays: number,
): AttributionRow[] {
  const windowStart = conversion.occurredAt.getTime() - lookbackDays * 86_400_000;

  const eligible = touches
    .filter((touch) => {
      // Only clicks someone paid for can be credited with ad performance.
      if (!isPaidTouch(touch)) return false;

      const at = touch.occurredAt.getTime();
      // A visit after the conversion cannot have caused it, and one before the
      // window opened is outside what this workspace counts.
      return at >= windowStart && at <= conversion.occurredAt.getTime();
    })
    // The caller's ordering is not guaranteed, and first/last click depend on it.
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id));

  if (eligible.length === 0) return [];

  const rows: AttributionRow[] = [];

  for (const model of ATTRIBUTION_MODELS) {
    const fractions = creditFractions(eligible, model, conversion.occurredAt);
    const valueParts = allocateCents(conversion.valueCents, fractions);
    const mrrParts =
      conversion.mrrCents === null ? null : allocateCents(conversion.mrrCents, fractions);

    eligible.forEach((touch, index) => {
      rows.push({
        workspaceId: conversion.workspaceId,
        conversionId: conversion.id,
        touchId: touch.id,
        model,
        // Stored as a string so Prisma's Decimal takes it without a float
        // round-trip. 11 places matches the column scale.
        creditFraction: fractions[index]!.toFixed(11),
        creditedValueCents: valueParts[index]!,
        creditedMrrCents: mrrParts === null ? null : mrrParts[index]!,
        // Reports group by when the money happened, not when the click did.
        occurredAt: conversion.occurredAt,
        platform: touch.platform,
        adId: touch.adId,
        adSetId: touch.adSetId,
        campaignId: touch.campaignId,
      });
    });
  }

  return rows;
}

const TOUCH_SELECT = {
  id: true,
  occurredAt: true,
  clickIdType: true,
  platform: true,
  adId: true,
  adSetId: true,
  campaignId: true,
} as const;

/**
 * Attribute a single conversion. Called on the ingest path.
 *
 * Idempotent: existing rows for the conversion are replaced, so a replay or a
 * change to the lookback window produces the right answer rather than double
 * credit.
 */
export async function attributeConversion(conversionId: string): Promise<number> {
  const conversion = await db.conversion.findUnique({
    where: { id: conversionId },
    select: {
      id: true,
      workspaceId: true,
      visitorId: true,
      occurredAt: true,
      valueCents: true,
      mrrCents: true,
      workspace: { select: { lookbackDays: true } },
    },
  });

  if (!conversion) return 0;

  // An anonymous conversion has no history to attribute to. It still counts
  // toward revenue; it simply has no ad behind it that we can see.
  if (!conversion.visitorId) return 0;

  const lookbackDays = conversion.workspace.lookbackDays;
  const windowStart = new Date(conversion.occurredAt.getTime() - lookbackDays * 86_400_000);

  const touches = await db.touch.findMany({
    where: {
      visitorId: conversion.visitorId,
      occurredAt: { gte: windowStart, lte: conversion.occurredAt },
    },
    select: TOUCH_SELECT,
    orderBy: { occurredAt: "asc" },
  });

  const rows = computeAttributionRows(conversion, touches, lookbackDays);

  await db.$transaction([
    db.attribution.deleteMany({ where: { conversionId } }),
    ...(rows.length > 0 ? [db.attribution.createMany({ data: rows })] : []),
  ]);

  return rows.length;
}

/**
 * Attribute every conversion in a workspace.
 *
 * Used to backfill seeded or imported history, and to recompute after the
 * lookback window changes. Loads touches per visitor in bulk rather than
 * per conversion, which turns thousands of round trips into a handful.
 */
export async function attributeWorkspace(
  workspaceId: string,
  options: { onProgress?: (done: number, total: number) => void } = {},
): Promise<{ conversions: number; rows: number }> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { lookbackDays: true },
  });
  if (!workspace) throw new Error(`No workspace ${workspaceId}`);

  const conversions = await db.conversion.findMany({
    where: { workspaceId, visitorId: { not: null } },
    select: {
      id: true,
      workspaceId: true,
      visitorId: true,
      occurredAt: true,
      valueCents: true,
      mrrCents: true,
    },
    orderBy: { occurredAt: "asc" },
  });

  if (conversions.length === 0) return { conversions: 0, rows: 0 };

  // One pass over the workspace's touches, bucketed by visitor.
  const visitorIds = [...new Set(conversions.map((c) => c.visitorId!))];
  const touchesByVisitor = new Map<string, TouchForAttribution[]>();

  const VISITOR_CHUNK = 2_000;
  for (let i = 0; i < visitorIds.length; i += VISITOR_CHUNK) {
    const chunk = visitorIds.slice(i, i + VISITOR_CHUNK);
    const touches = await db.touch.findMany({
      where: { workspaceId, visitorId: { in: chunk } },
      select: { ...TOUCH_SELECT, visitorId: true },
      orderBy: { occurredAt: "asc" },
    });
    for (const { visitorId, ...touch } of touches) {
      const list = touchesByVisitor.get(visitorId);
      if (list) list.push(touch);
      else touchesByVisitor.set(visitorId, [touch]);
    }
  }

  const rows: AttributionRow[] = [];
  for (const conversion of conversions) {
    rows.push(
      ...computeAttributionRows(
        conversion,
        touchesByVisitor.get(conversion.visitorId!) ?? [],
        workspace.lookbackDays,
      ),
    );
  }

  await db.attribution.deleteMany({ where: { workspaceId } });

  const INSERT_CHUNK = 5_000;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await db.attribution.createMany({ data: rows.slice(i, i + INSERT_CHUNK) });
    options.onProgress?.(Math.min(i + INSERT_CHUNK, rows.length), rows.length);
  }

  return { conversions: conversions.length, rows: rows.length };
}
