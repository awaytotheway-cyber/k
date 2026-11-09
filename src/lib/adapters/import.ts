/**
 * Apply parsed spend rows to a workspace.
 *
 * Idempotent by construction. Spend upserts on (workspace, entityKey, date),
 * and campaigns, ad sets and ads are created only if their name is new, so
 * re-uploading last month's export on top of this month's corrects the overlap
 * instead of doubling it. Someone re-importing a file to fix one typo should
 * not end up with twice the spend.
 */
import type { Platform } from "@/generated/prisma/enums";
import type { SpendCsvRow } from "@/lib/adapters/csv";
import { db } from "@/lib/db";

export type ImportResult = {
  importedRows: number;
  createdCampaigns: number;
  createdAdSets: number;
  createdAds: number;
  /** Rows whose spend replaced an earlier figure for the same entity and day. */
  updatedRows: number;
};

/** A stable external id from a name, so re-imports match the same entity. */
function externalIdFor(prefix: string, ...parts: string[]): string {
  const slug = parts
    .join("|")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  return `${prefix}:${slug}`;
}

export async function applySpendRows(
  workspaceId: string,
  platform: Platform,
  rows: SpendCsvRow[],
  options: { filename: string; mapping?: unknown } = { filename: "upload.csv" },
): Promise<ImportResult> {
  const result: ImportResult = {
    importedRows: 0,
    createdCampaigns: 0,
    createdAdSets: 0,
    createdAds: 0,
    updatedRows: 0,
  };

  if (rows.length === 0) return result;

  // One ad account per platform per workspace for CSV imports: the file does
  // not name an account, and inventing several would fragment the hierarchy.
  const account = await db.adAccount.upsert({
    where: {
      workspaceId_platform_externalAccountId: {
        workspaceId,
        platform,
        externalAccountId: "csv-import",
      },
    },
    create: {
      workspaceId,
      platform,
      externalAccountId: "csv-import",
      name: `${platform} (CSV import)`,
      source: "CSV",
      connectionStatus: "CONNECTED",
      lastSyncedAt: new Date(),
    },
    update: { lastSyncedAt: new Date() },
    select: { id: true },
  });

  // Resolve the hierarchy once per distinct name rather than per row.
  const campaignIds = new Map<string, string>();
  const adSetIds = new Map<string, string>();
  const adIds = new Map<string, string>();

  for (const row of rows) {
    if (!campaignIds.has(row.campaignName)) {
      const externalId = externalIdFor("cmp", row.campaignName);
      const existing = await db.campaign.findUnique({
        where: { adAccountId_externalId: { adAccountId: account.id, externalId } },
        select: { id: true },
      });
      if (existing) {
        campaignIds.set(row.campaignName, existing.id);
      } else {
        const created = await db.campaign.create({
          data: {
            workspaceId,
            adAccountId: account.id,
            externalId,
            name: row.campaignName,
            status: "IMPORTED",
          },
          select: { id: true },
        });
        campaignIds.set(row.campaignName, created.id);
        result.createdCampaigns++;
      }
    }
    const campaignId = campaignIds.get(row.campaignName)!;

    let adSetId: string | null = null;
    if (row.adSetName) {
      const key = `${row.campaignName}|${row.adSetName}`;
      if (!adSetIds.has(key)) {
        const externalId = externalIdFor("as", row.campaignName, row.adSetName);
        const existing = await db.adSet.findUnique({
          where: { campaignId_externalId: { campaignId, externalId } },
          select: { id: true },
        });
        if (existing) {
          adSetIds.set(key, existing.id);
        } else {
          const created = await db.adSet.create({
            data: { workspaceId, campaignId, externalId, name: row.adSetName, status: "IMPORTED" },
            select: { id: true },
          });
          adSetIds.set(key, created.id);
          result.createdAdSets++;
        }
      }
      adSetId = adSetIds.get(key)!;
    }

    let adId: string | null = null;
    if (row.adName && adSetId) {
      const key = `${row.campaignName}|${row.adSetName}|${row.adName}`;
      if (!adIds.has(key)) {
        const externalId = externalIdFor("ad", row.campaignName, row.adSetName ?? "", row.adName);
        const existing = await db.ad.findUnique({
          where: { adSetId_externalId: { adSetId, externalId } },
          select: { id: true },
        });
        if (existing) {
          adIds.set(key, existing.id);
        } else {
          const created = await db.ad.create({
            data: {
              workspaceId,
              adSetId,
              campaignId,
              externalId,
              name: row.adName,
              status: "IMPORTED",
            },
            select: { id: true },
          });
          adIds.set(key, created.id);
          result.createdAds++;
        }
      }
      adId = adIds.get(key)!;
    }

    // entityKey gives a single non-null unique target, so the upsert works at
    // whichever level the file described.
    const entityKey = adId
      ? `ad:${adId}`
      : adSetId
        ? `adset:${adSetId}`
        : `campaign:${campaignId}`;

    const existingSpend = await db.spendDaily.findUnique({
      where: { workspaceId_entityKey_date: { workspaceId, entityKey, date: row.date } },
      select: { id: true },
    });
    if (existingSpend) result.updatedRows++;

    await db.spendDaily.upsert({
      where: { workspaceId_entityKey_date: { workspaceId, entityKey, date: row.date } },
      create: {
        workspaceId,
        level: row.level,
        entityKey,
        date: row.date,
        platform,
        adId,
        adSetId,
        campaignId,
        spendCents: row.spendCents,
        impressions: row.impressions,
        clicks: row.clicks,
      },
      update: {
        spendCents: row.spendCents,
        impressions: row.impressions,
        clicks: row.clicks,
        level: row.level,
        platform,
      },
    });

    result.importedRows++;
  }

  await db.importBatch.create({
    data: {
      workspaceId,
      filename: options.filename,
      rowCount: rows.length,
      importedCount: result.importedRows,
      skippedCount: rows.length - result.importedRows,
      mapping: (options.mapping ?? undefined) as never,
    },
  });

  return result;
}
