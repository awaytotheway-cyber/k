/**
 * Where did this visit come from?
 *
 * Click ids are the whole reason attribution works before any platform API is
 * connected: an ad click lands with `?gclid=…` or `?fbclid=…` in the URL, for
 * free, and that identifier ties the visit to the ad that bought it.
 *
 * Three sources of truth, in descending order of trust:
 *   1. A click id in the URL — unambiguous, names the platform exactly.
 *   2. Paid UTM parameters — survives when privacy tooling strips click ids.
 *   3. The referrer — only good enough to separate organic from referral.
 *
 * Pure: no clock, no database, no network.
 */
import type { ClickIdType, Platform } from "@/generated/prisma/enums";

export type Utm = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
};

export type Provenance = {
  clickId: string | null;
  clickIdType: ClickIdType;
  platform: Platform;
  utm: Utm;
};

/**
 * Longest click id we store. Real ones are well under 200 characters; anything
 * longer is a redirect chain or an attack, and the column is not a dumping
 * ground.
 */
const MAX_CLICK_ID_LENGTH = 512;

/**
 * Ordered, so a redirect that leaves two click ids behind resolves the same
 * way every time. Google first: a stale `fbclid` riding along on a Google
 * click is far more common than the reverse.
 */
const CLICK_ID_PARAMS: Array<[param: string, type: ClickIdType, platform: Platform]> = [
  ["gclid", "GCLID", "GOOGLE"],
  ["gbraid", "GBRAID", "GOOGLE"],
  ["wbraid", "WBRAID", "GOOGLE"],
  ["fbclid", "FBCLID", "META"],
  ["ttclid", "TTCLID", "TIKTOK"],
  ["li_fat_id", "LI_FAT_ID", "LINKEDIN"],
  ["msclkid", "MSCLKID", "MICROSOFT"],
];

/** utm_medium values that mean someone paid for the click. */
const PAID_MEDIUMS = new Set([
  "cpc",
  "ppc",
  "paid",
  "paidsocial",
  "paid_social",
  "paid-social",
  "cpm",
  "display",
  "retargeting",
  "remarketing",
]);

/** utm_source spellings people actually use, mapped to a platform. */
const SOURCE_PLATFORMS: Array<[match: string[], platform: Platform]> = [
  [["facebook", "fb", "meta", "instagram", "ig", "messenger"], "META"],
  [["google", "adwords", "googleads", "google_ads", "youtube", "gdn"], "GOOGLE"],
  [["tiktok", "tiktokads", "tt"], "TIKTOK"],
  [["linkedin", "li"], "LINKEDIN"],
  [["bing", "microsoft", "msn"], "MICROSOFT"],
];

const SEARCH_ENGINE_HOSTS = [
  "google.",
  "bing.",
  "duckduckgo.",
  "yahoo.",
  "ecosia.",
  "brave.",
  "baidu.",
  "yandex.",
  "startpage.",
  "search.marginalia",
  "perplexity.",
  "chatgpt.",
  "openai.",
  "claude.",
];

function cleanParam(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Query lookup that tolerates upper-cased keys from link rewriters. */
function getParam(params: URLSearchParams, name: string): string | null {
  const direct = params.get(name);
  if (direct !== null) return cleanParam(direct);

  const lower = name.toLowerCase();
  for (const [key, value] of params.entries()) {
    if (key.toLowerCase() === lower) return cleanParam(value);
  }
  return null;
}

function platformForSource(source: string | null): Platform | null {
  if (!source) return null;
  const normalized = source.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [matches, platform] of SOURCE_PLATFORMS) {
    if (matches.includes(normalized)) return platform;
  }
  return null;
}

function hostOf(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Classify a visit from its landing URL and referrer.
 *
 * Never throws: a malformed URL degrades to DIRECT rather than losing the
 * event, because this runs on the ingest hot path and a dropped event is a
 * hole in someone's attribution.
 */
export function parseProvenance(input: { url: string; referrer?: string | null }): Provenance {
  let parsed: URL | null = null;
  try {
    parsed = new URL(input.url);
  } catch {
    parsed = null;
  }

  const params = parsed?.searchParams ?? new URLSearchParams();

  const utm: Utm = {
    source: getParam(params, "utm_source"),
    medium: getParam(params, "utm_medium"),
    campaign: getParam(params, "utm_campaign"),
    content: getParam(params, "utm_content"),
    term: getParam(params, "utm_term"),
  };

  // 1. A click id settles it.
  for (const [param, type, platform] of CLICK_ID_PARAMS) {
    const value = getParam(params, param);
    if (value) {
      return { clickId: value.slice(0, MAX_CLICK_ID_LENGTH), clickIdType: type, platform, utm };
    }
  }

  const medium = utm.medium?.toLowerCase() ?? null;

  // 2. Paid UTMs, for when privacy tooling stripped the click id.
  if (medium && PAID_MEDIUMS.has(medium)) {
    const platform = platformForSource(utm.source);
    return { clickId: null, clickIdType: "NONE", platform: platform ?? "OTHER", utm };
  }

  if (medium === "email" || medium === "newsletter") {
    return { clickId: null, clickIdType: "NONE", platform: "EMAIL", utm };
  }

  // 3. Referrer, which only distinguishes organic from referral.
  const referrerHost = hostOf(input.referrer);
  if (!referrerHost) {
    return { clickId: null, clickIdType: "NONE", platform: "DIRECT", utm };
  }

  // Our own pages are the same visit continuing, not a new source.
  const landingHost = parsed?.hostname.toLowerCase() ?? null;
  if (landingHost && referrerHost === landingHost) {
    return { clickId: null, clickIdType: "NONE", platform: "DIRECT", utm };
  }

  if (SEARCH_ENGINE_HOSTS.some((engine) => referrerHost.includes(engine))) {
    return { clickId: null, clickIdType: "NONE", platform: "ORGANIC", utm };
  }

  return { clickId: null, clickIdType: "NONE", platform: "REFERRAL", utm };
}

const AD_PLATFORMS = new Set<Platform>(["META", "GOOGLE", "TIKTOK", "LINKEDIN", "MICROSOFT"]);

/**
 * Should this touch receive attribution credit?
 *
 * Only clicks someone paid for. Organic, direct, referral and email visits are
 * recorded — they matter for the full picture — but crediting ad spend to them
 * would make every campaign look better than it is.
 */
export function isPaidTouch(
  provenance: Pick<Provenance, "clickIdType" | "platform">,
): boolean {
  return provenance.clickIdType !== "NONE" || AD_PLATFORMS.has(provenance.platform);
}
