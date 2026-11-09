/**
 * Link recorded clicks to the ads that produced them.
 *
 * A click id alone does not name an ad. `fbclid` tells us the click came from
 * Meta; it does not say which creative, and resolving it requires the Meta API
 * we do not have yet. What does name the ad is the landing URL — either an
 * explicit id parameter, or `utm_content` carrying the ad's name, which is how
 * most accounts are already set up.
 *
 * This also has to run *after the fact*. Clicks usually arrive before the
 * spend export that creates the ad rows, so a touch recorded on Monday only
 * becomes linkable when Friday's CSV lands. Import calls this, which is what
 * makes the CSV-first path actually produce per-ad numbers rather than
 * platform totals.
 */
import { db } from "@/lib/db";

type AdIndex = {
  byExternalId: Map<string, AdTarget>;
  byName: Map<string, AdTarget>;
};

type AdTarget = { adId: string; adSetId: string; campaignId: string };
type CampaignTarget = { campaignId: string };

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export async function resolveTouchAds(workspaceId: string): Promise<number> {
  const [ads, campaigns] = await Promise.all([
    db.ad.findMany({
      where: { workspaceId },
      select: { id: true, externalId: true, name: true, adSetId: true, campaignId: true },
    }),
    db.campaign.findMany({
      where: { workspaceId },
      select: { id: true, externalId: true, name: true },
    }),
  ]);

  if (ads.length === 0) return 0;

  const index: AdIndex = { byExternalId: new Map(), byName: new Map() };
  for (const ad of ads) {
    const target: AdTarget = { adId: ad.id, adSetId: ad.adSetId, campaignId: ad.campaignId };
    index.byExternalId.set(normalize(ad.externalId), target);
    // Last writer wins on a duplicate name; an exact id match is tried first,
    // so this only decides between ads that genuinely share a name.
    index.byName.set(normalize(ad.name), target);
  }

  const campaignIndex = new Map<string, CampaignTarget>();
  for (const campaign of campaigns) {
    campaignIndex.set(normalize(campaign.externalId), { campaignId: campaign.id });
    campaignIndex.set(normalize(campaign.name), { campaignId: campaign.id });
  }

  // Only touches that are still unlinked and carry something to match on.
  const touches = await db.touch.findMany({
    where: {
      workspaceId,
      adId: null,
      OR: [
        { externalAdId: { not: null } },
        { utmContent: { not: null } },
        { utmCampaign: { not: null } },
      ],
    },
    select: {
      id: true,
      externalAdId: true,
      externalCampaignId: true,
      utmContent: true,
      utmCampaign: true,
      campaignId: true,
    },
  });

  if (touches.length === 0) return 0;

  // Group by destination so each distinct target is one UPDATE, not one per row.
  const adGroups = new Map<string, { target: AdTarget; touchIds: string[] }>();
  const campaignGroups = new Map<string, string[]>();

  for (const touch of touches) {
    const adCandidates = [touch.externalAdId, touch.utmContent].filter(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    );

    let target: AdTarget | undefined;
    for (const candidate of adCandidates) {
      const key = normalize(candidate);
      target = index.byExternalId.get(key) ?? index.byName.get(key);
      if (target) break;
    }

    if (target) {
      const group = adGroups.get(target.adId);
      if (group) group.touchIds.push(touch.id);
      else adGroups.set(target.adId, { target, touchIds: [touch.id] });
      continue;
    }

    // No ad matched. A campaign still beats nothing: it puts the click in the
    // right campaign's numbers even though the creative stays unknown.
    if (touch.campaignId) continue;

    const campaignCandidates = [touch.externalCampaignId, touch.utmCampaign].filter(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    );
    for (const candidate of campaignCandidates) {
      const match = campaignIndex.get(normalize(candidate));
      if (match) {
        const list = campaignGroups.get(match.campaignId);
        if (list) list.push(touch.id);
        else campaignGroups.set(match.campaignId, [touch.id]);
        break;
      }
    }
  }

  let updated = 0;

  for (const { target, touchIds } of adGroups.values()) {
    const result = await db.touch.updateMany({
      where: { id: { in: touchIds } },
      data: { adId: target.adId, adSetId: target.adSetId, campaignId: target.campaignId },
    });
    updated += result.count;
  }

  for (const [campaignId, touchIds] of campaignGroups.entries()) {
    const result = await db.touch.updateMany({
      where: { id: { in: touchIds } },
      data: { campaignId },
    });
    updated += result.count;
  }

  return updated;
}
