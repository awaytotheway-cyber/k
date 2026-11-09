import { parseProvenance } from "@/lib/clickids";
import { db } from "@/lib/db";
import {
  collectPayloadSchema,
  corsPreflight,
  countryFrom,
  deviceTypeFrom,
  hashIp,
  noContent,
  readJsonBody,
  safeTimestamp,
} from "@/lib/ingest";

/**
 * Page-view ingest. The hot path: every visit to every customer's site.
 *
 * Runs on the Node runtime rather than the edge because the Postgres driver
 * adapter needs a TCP socket. The work is one upsert and one insert, both on
 * indexed columns.
 *
 * Always answers 204, even for an unknown key or a malformed body. The caller
 * is a fire-and-forget beacon on someone else's website: it cannot act on an
 * error, and a 4xx would only show up as noise in their console.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ad hierarchy ids a customer can pass through on the landing URL. */
const AD_PARAMS = ["tr_ad", "ad_id", "adid"];
const ADSET_PARAMS = ["tr_adset", "adset_id", "adgroupid"];
const CAMPAIGN_PARAMS = ["tr_campaign", "campaign_id", "campaignid"];

function firstParam(url: URL | null, names: string[]): string | null {
  if (!url) return null;
  for (const [key, value] of url.searchParams.entries()) {
    if (names.includes(key.toLowerCase())) {
      const trimmed = value.trim();
      if (trimmed) return trimmed.slice(0, 128);
    }
  }
  return null;
}

export async function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  const body = await readJsonBody<unknown>(request);
  if (!body) return noContent();

  const parsed = collectPayloadSchema.safeParse(body);
  if (!parsed.success) {
    // A dropped event is invisible to the sender, so make it visible to us.
    console.warn("[collect] rejected payload:", parsed.error.issues.map((i) => i.path.join(".")));
    return noContent();
  }

  const { k: pixelKey, v: anonId, s: sessionId, u: landingUrl, r: referrer, t } = parsed.data;

  const workspace = await db.workspace.findUnique({
    where: { pixelKey },
    select: { id: true },
  });
  if (!workspace) return noContent();

  const provenance = parseProvenance({ url: landingUrl, referrer });
  const occurredAt = safeTimestamp(t);

  let url: URL | null = null;
  try {
    url = new URL(landingUrl);
  } catch {
    url = null;
  }

  const externalAdId = firstParam(url, AD_PARAMS);
  const externalAdSetId = firstParam(url, ADSET_PARAMS);
  const externalCampaignId = firstParam(url, CAMPAIGN_PARAMS);

  // Link to the ad now if we can.
  //
  // A click id names the platform, never the creative — resolving fbclid to an
  // ad needs the Meta API. What does name it is an explicit id parameter or
  // utm_content carrying the ad's name, which is how most accounts are set up.
  //
  // When nothing matches, the raw values are still stored: the ad usually does
  // not exist yet, and resolveTouchAds links these retroactively once a spend
  // import creates it.
  const adCandidates = [externalAdId, provenance.utm.content].filter(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  );

  const ad =
    adCandidates.length > 0
      ? await db.ad.findFirst({
          where: {
            workspaceId: workspace.id,
            OR: adCandidates.flatMap((value) => [
              { externalId: value },
              { name: { equals: value, mode: "insensitive" as const } },
            ]),
          },
          select: { id: true, adSetId: true, campaignId: true },
        })
      : null;

  const visitor = await db.visitor.upsert({
    where: { workspaceId_anonId: { workspaceId: workspace.id, anonId } },
    create: {
      workspaceId: workspace.id,
      anonId,
      firstSeenAt: occurredAt,
      lastSeenAt: occurredAt,
    },
    update: { lastSeenAt: occurredAt },
    select: { id: true },
  });

  await db.touch.create({
    data: {
      workspaceId: workspace.id,
      visitorId: visitor.id,
      occurredAt,
      landingUrl: landingUrl.slice(0, 2048),
      referrer: referrer?.slice(0, 2048) ?? null,
      utmSource: provenance.utm.source,
      utmMedium: provenance.utm.medium,
      utmCampaign: provenance.utm.campaign,
      utmContent: provenance.utm.content,
      utmTerm: provenance.utm.term,
      clickId: provenance.clickId,
      clickIdType: provenance.clickIdType,
      platform: provenance.platform,
      externalAdId,
      externalAdSetId,
      externalCampaignId,
      adId: ad?.id ?? null,
      adSetId: ad?.adSetId ?? null,
      campaignId: ad?.campaignId ?? null,
      deviceType: deviceTypeFrom(request.headers.get("user-agent")),
      country: countryFrom(request),
      ipHash: hashIp(request),
      sessionId: sessionId ?? null,
    },
  });

  return noContent();
}
