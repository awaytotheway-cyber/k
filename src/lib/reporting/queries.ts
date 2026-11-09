/**
 * Reporting queries.
 *
 * Every figure the product shows comes from here, so the definitions live in
 * one place and the dashboard, the ads table and (later) the AI brief cannot
 * drift apart on what "CAC" means.
 *
 * Two definitions worth stating plainly:
 *
 *   Acquisitions — conversions of an acquisition type (trial, demo, signup,
 *   qualified). CAC divides spend by these. Counting subscriptions too would
 *   count the same customer twice and halve every CAC in the product.
 *
 *   Attributed conversions — the sum of credit fractions, not a count of rows.
 *   Under last click that is a whole number; under linear a conversion split
 *   across three ads contributes a third to each, which is the only way the
 *   per-ad figures add back up to the total.
 */
import type { AttributionModel, ConversionType, Platform } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { cacEstimate, type CacEstimate } from "@/lib/stats/confidence";
import { ACQUISITION_EVENTS, type DateRange } from "@/lib/reporting/range";

export type Summary = {
  spendCents: number;
  clicks: number;
  impressions: number;
  /** Acquisition-type conversions credited in this window. */
  acquisitions: number;
  newMrrCents: number;
  attributedValueCents: number;
  /** Blended cost per acquisition, or null when there were none. */
  cacCents: number | null;
  /** Months of the acquired MRR needed to repay the spend. */
  paybackMonths: number | null;
  /** Conversions with no paid touch behind them. Honest about our coverage. */
  unattributedConversions: number;
};

/** Headline numbers for a workspace over a window. */
export async function getSummary(
  workspaceId: string,
  range: DateRange,
  model: AttributionModel,
): Promise<Summary> {
  const occurredAt = { gte: range.from, lte: range.to };

  const [spend, acquisitionAgg, revenueAgg, totalConversions, attributedConversionIds] =
    await Promise.all([
      db.spendDaily.aggregate({
        where: { workspaceId, date: occurredAt },
        _sum: { spendCents: true, clicks: true, impressions: true },
      }),
      // Credit fractions, summed, for acquisition events only.
      db.attribution.aggregate({
        where: {
          workspaceId,
          model,
          occurredAt,
          conversion: { eventType: { in: ACQUISITION_EVENTS } },
        },
        _sum: { creditFraction: true },
      }),
      db.attribution.aggregate({
        where: { workspaceId, model, occurredAt },
        _sum: { creditedMrrCents: true, creditedValueCents: true },
      }),
      db.conversion.count({ where: { workspaceId, occurredAt } }),
      db.attribution.findMany({
        where: { workspaceId, model, occurredAt },
        select: { conversionId: true },
        distinct: ["conversionId"],
      }),
    ]);

  const spendCents = spend._sum.spendCents ?? 0;
  const acquisitions = Number(acquisitionAgg._sum.creditFraction ?? 0);
  const newMrrCents = revenueAgg._sum.creditedMrrCents ?? 0;

  return {
    spendCents,
    clicks: spend._sum.clicks ?? 0,
    impressions: spend._sum.impressions ?? 0,
    acquisitions,
    newMrrCents,
    attributedValueCents: revenueAgg._sum.creditedValueCents ?? 0,
    cacCents: acquisitions > 0 ? Math.round(spendCents / acquisitions) : null,
    paybackMonths: newMrrCents > 0 ? spendCents / newMrrCents : null,
    unattributedConversions: Math.max(0, totalConversions - attributedConversionIds.length),
  };
}

export type AdRow = {
  adId: string;
  adName: string;
  adSetName: string;
  campaignName: string;
  platform: Platform;
  angleName: string | null;
  spendCents: number;
  clicks: number;
  impressions: number;
  /** Fractional under multi-touch models; see the note at the top of this file. */
  acquisitions: number;
  newMrrCents: number;
  cac: CacEstimate;
};

export type AdQuery = {
  range: DateRange;
  model: AttributionModel;
  search?: string;
  platform?: Platform | "ALL";
  targetCacCents: number | null;
};

/**
 * Per-ad performance: cost from the spend table, credit from the attribution
 * table, joined in memory because they are two independent aggregates over
 * different time columns.
 */
export async function getAdPerformance(
  workspaceId: string,
  query: AdQuery,
): Promise<AdRow[]> {
  const { range, model, search, platform, targetCacCents } = query;
  const window = { gte: range.from, lte: range.to };

  const platformFilter = platform && platform !== "ALL" ? { platform } : {};

  const [ads, spendRows, acquisitionRows, mrrRows] = await Promise.all([
    db.ad.findMany({
      where: {
        workspaceId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { headline: { contains: search, mode: "insensitive" as const } },
                { campaign: { name: { contains: search, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        adSet: { select: { name: true } },
        campaign: { select: { name: true, adAccount: { select: { platform: true } } } },
        angle: { select: { name: true } },
      },
    }),
    db.spendDaily.groupBy({
      by: ["adId"],
      where: { workspaceId, date: window, adId: { not: null }, ...platformFilter },
      _sum: { spendCents: true, clicks: true, impressions: true },
    }),
    db.attribution.groupBy({
      by: ["adId"],
      where: {
        workspaceId,
        model,
        occurredAt: window,
        adId: { not: null },
        conversion: { eventType: { in: ACQUISITION_EVENTS } },
      },
      _sum: { creditFraction: true },
    }),
    db.attribution.groupBy({
      by: ["adId"],
      where: { workspaceId, model, occurredAt: window, adId: { not: null } },
      _sum: { creditedMrrCents: true },
    }),
  ]);

  const spendByAd = new Map(spendRows.map((r) => [r.adId!, r._sum]));
  const acquisitionsByAd = new Map(
    acquisitionRows.map((r) => [r.adId!, Number(r._sum.creditFraction ?? 0)]),
  );
  const mrrByAd = new Map(mrrRows.map((r) => [r.adId!, r._sum.creditedMrrCents ?? 0]));

  const rows: AdRow[] = ads.map((ad) => {
    const spend = spendByAd.get(ad.id);
    const spendCents = spend?.spendCents ?? 0;
    const acquisitions = acquisitionsByAd.get(ad.id) ?? 0;

    return {
      adId: ad.id,
      adName: ad.name,
      adSetName: ad.adSet.name,
      campaignName: ad.campaign.name,
      platform: ad.campaign.adAccount.platform,
      angleName: ad.angle?.name ?? null,
      spendCents,
      clicks: spend?.clicks ?? 0,
      impressions: spend?.impressions ?? 0,
      acquisitions,
      newMrrCents: mrrByAd.get(ad.id) ?? 0,
      cac: cacEstimate({
        // The Poisson model needs a whole number of events. Under last click
        // this is already exact; under multi-touch models it is the nearest
        // whole conversion, which is the right granularity for a verdict.
        conversions: Math.round(acquisitions),
        spendCents,
        targetCacCents,
      }),
    };
  });

  // Ads with no spend and no credit in this window are noise.
  const active = rows.filter((r) => r.spendCents > 0 || r.acquisitions > 0);

  if (platform && platform !== "ALL") {
    return active.filter((r) => r.platform === platform).sort(bySpendDesc);
  }
  return active.sort(bySpendDesc);
}

const bySpendDesc = (a: AdRow, b: AdRow) => b.spendCents - a.spendCents;

export type TrendPoint = {
  date: string;
  spendCents: number;
  acquisitions: number;
  newMrrCents: number;
};

/** Daily spend against daily credited conversions, for the dashboard chart. */
export async function getTrend(
  workspaceId: string,
  range: DateRange,
  model: AttributionModel,
): Promise<TrendPoint[]> {
  const window = { gte: range.from, lte: range.to };

  const [spendRows, attributionRows] = await Promise.all([
    db.spendDaily.groupBy({
      by: ["date"],
      where: { workspaceId, date: window },
      _sum: { spendCents: true },
    }),
    db.attribution.findMany({
      where: { workspaceId, model, occurredAt: window },
      select: {
        occurredAt: true,
        creditFraction: true,
        creditedMrrCents: true,
        conversion: { select: { eventType: true } },
      },
    }),
  ]);

  const byDay = new Map<string, TrendPoint>();

  // Seed every day in the window so the chart has no gaps where nothing
  // happened — a missing day reads as missing data, not as a quiet day.
  for (let d = new Date(range.from); d <= range.to; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { date: key, spendCents: 0, acquisitions: 0, newMrrCents: 0 });
  }

  for (const row of spendRows) {
    const key = row.date.toISOString().slice(0, 10);
    const point = byDay.get(key);
    if (point) point.spendCents = row._sum.spendCents ?? 0;
  }

  for (const row of attributionRows) {
    const key = row.occurredAt.toISOString().slice(0, 10);
    const point = byDay.get(key);
    if (!point) continue;
    if (ACQUISITION_EVENTS.includes(row.conversion.eventType)) {
      point.acquisitions += Number(row.creditFraction);
    }
    point.newMrrCents += row.creditedMrrCents ?? 0;
  }

  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type ConversionRow = {
  id: string;
  eventName: string;
  eventType: string;
  occurredAt: Date;
  valueCents: number;
  mrrCents: number | null;
  email: string | null;
  source: string;
  /** The ad credited under the selected model, if any. */
  creditedAdName: string | null;
  creditedPlatform: Platform | null;
  touchCount: number;
};

export type ConversionQuery = {
  range: DateRange;
  model: AttributionModel;
  search?: string;
  eventType?: ConversionType | "ALL";
  page: number;
  pageSize: number;
};

export async function getConversions(
  workspaceId: string,
  query: ConversionQuery,
): Promise<{ rows: ConversionRow[]; total: number }> {
  const { range, model, search, eventType, page, pageSize } = query;

  const where = {
    workspaceId,
    occurredAt: { gte: range.from, lte: range.to },
    ...(eventType && eventType !== "ALL" ? { eventType } : {}),
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { eventName: { contains: search, mode: "insensitive" as const } },
            { externalId: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  } as const;

  const [total, conversions] = await Promise.all([
    db.conversion.count({ where }),
    db.conversion.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        eventName: true,
        eventType: true,
        occurredAt: true,
        valueCents: true,
        mrrCents: true,
        email: true,
        source: true,
        attributions: {
          where: { model },
          orderBy: { creditedValueCents: "desc" },
          select: {
            platform: true,
            creditFraction: true,
            ad: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  return {
    total,
    rows: conversions.map((c) => {
      const top = c.attributions[0];
      return {
        id: c.id,
        eventName: c.eventName,
        eventType: c.eventType,
        occurredAt: c.occurredAt,
        valueCents: c.valueCents,
        mrrCents: c.mrrCents,
        email: c.email,
        source: c.source,
        creditedAdName: top?.ad?.name ?? null,
        creditedPlatform: top?.platform ?? null,
        touchCount: c.attributions.length,
      };
    }),
  };
}

export type PathTouch = {
  id: string;
  occurredAt: Date;
  platform: Platform;
  clickIdType: string;
  landingUrl: string;
  adName: string | null;
  campaignName: string | null;
};

/**
 * Touch paths for a page of conversions, in one query.
 *
 * Fetching per row would be fifty round trips to render one table. This loads
 * every relevant visitor's touches at once and buckets them in memory.
 */
export async function getTouchPaths(
  workspaceId: string,
  conversionIds: string[],
  lookbackDays: number,
): Promise<Map<string, PathTouch[]>> {
  const paths = new Map<string, PathTouch[]>();
  if (conversionIds.length === 0) return paths;

  const conversions = await db.conversion.findMany({
    where: { id: { in: conversionIds }, workspaceId, visitorId: { not: null } },
    select: { id: true, visitorId: true, occurredAt: true },
  });
  if (conversions.length === 0) return paths;

  const earliest = new Date(
    Math.min(...conversions.map((c) => c.occurredAt.getTime())) - lookbackDays * 86_400_000,
  );

  const touches = await db.touch.findMany({
    where: {
      workspaceId,
      visitorId: { in: [...new Set(conversions.map((c) => c.visitorId!))] },
      occurredAt: { gte: earliest },
    },
    orderBy: { occurredAt: "asc" },
    select: {
      id: true,
      visitorId: true,
      occurredAt: true,
      platform: true,
      clickIdType: true,
      landingUrl: true,
      ad: { select: { name: true } },
      campaign: { select: { name: true } },
    },
  });

  const byVisitor = new Map<string, typeof touches>();
  for (const touch of touches) {
    const list = byVisitor.get(touch.visitorId);
    if (list) list.push(touch);
    else byVisitor.set(touch.visitorId, [touch]);
  }

  for (const conversion of conversions) {
    const windowStart = conversion.occurredAt.getTime() - lookbackDays * 86_400_000;
    const relevant = (byVisitor.get(conversion.visitorId!) ?? []).filter((t) => {
      const at = t.occurredAt.getTime();
      return at >= windowStart && at <= conversion.occurredAt.getTime();
    });

    paths.set(
      conversion.id,
      relevant.map((t) => ({
        id: t.id,
        occurredAt: t.occurredAt,
        platform: t.platform,
        clickIdType: t.clickIdType,
        landingUrl: t.landingUrl,
        adName: t.ad?.name ?? null,
        campaignName: t.campaign?.name ?? null,
      })),
    );
  }

  return paths;
}

/** The full click path behind one conversion, oldest first. */
export async function getTouchPath(workspaceId: string, conversionId: string) {
  const conversion = await db.conversion.findFirst({
    where: { id: conversionId, workspaceId },
    select: { visitorId: true, occurredAt: true, workspace: { select: { lookbackDays: true } } },
  });

  if (!conversion?.visitorId) return [];

  const from = new Date(
    conversion.occurredAt.getTime() - conversion.workspace.lookbackDays * 86_400_000,
  );

  return db.touch.findMany({
    where: {
      visitorId: conversion.visitorId,
      occurredAt: { gte: from, lte: conversion.occurredAt },
    },
    orderBy: { occurredAt: "asc" },
    select: {
      id: true,
      occurredAt: true,
      platform: true,
      clickIdType: true,
      landingUrl: true,
      utmCampaign: true,
      ad: { select: { name: true } },
      campaign: { select: { name: true } },
    },
  });
}
