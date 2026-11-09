/**
 * Demo workspace seeder.
 *
 *   npm run seed:demo                      # creates/refreshes the demo account
 *   npm run seed:demo -- --email you@co.com  # attach the demo workspace to your org
 *
 * Why this exists twice over:
 *   1. Every screen needs data to be designed against, and empty tables make
 *      layout decisions impossible to judge.
 *   2. It is the sales demo. A prospect sees 90 days of plausible history on the
 *      first call, before they have installed anything.
 *
 * The data is deliberately not uniform. It contains, on purpose:
 *   - a star ad (low CAC, high volume)        -> the SCALE case
 *   - a money pit (high spend, ~no revenue)   -> the CUT case
 *   - a low-volume ad with 2 conversions      -> the TOO EARLY case, which is
 *     what the confidence layer exists to catch
 *   - organic and direct traffic, so not everything is attributable
 *   - a tracking gap (3 days with no Google click ids) for the health page
 *
 * Output is deterministic: same seed, same numbers, so screenshots are stable.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import type { ClickIdType, ConversionType, Platform } from "../src/generated/prisma/enums";

const DAYS = 90;
const DEMO_SLUG = "acme-demo";
const DEMO_EMAIL = "demo@trueroas.local";
const DEMO_PASSWORD = "demo-password-1234";
const RANDOM_SEED = 20261109;

// --------------------------------------------------------------------------
// Deterministic randomness (mulberry32)
// --------------------------------------------------------------------------

function makeRandom(seed: number) {
  let state = seed >>> 0;
  return function random(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(RANDOM_SEED);

/** Random float in [min, max). */
function between(min: number, max: number): number {
  return min + random() * (max - min);
}

/** Multiplicative jitter, e.g. jitter(0.25) -> 0.75..1.25 */
function jitter(spread: number): number {
  return 1 + between(-spread, spread);
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

/** Weighted pick. Weights need not sum to 1. */
function pickWeighted<T>(entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1]![0];
}

// --------------------------------------------------------------------------
// Dates
// --------------------------------------------------------------------------

/** UTC midnight, `daysAgo` days before today. */
function dayStart(daysAgo: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

/** A random moment inside a given day, weighted toward business hours. */
function timeWithinDay(daysAgo: number): Date {
  const d = dayStart(daysAgo);
  const hour = pickWeighted([
    [9, 3], [10, 4], [11, 4], [12, 3], [13, 3], [14, 4],
    [15, 4], [16, 3], [17, 2], [18, 2], [19, 2], [20, 2],
    [21, 1], [8, 2], [7, 1], [22, 1], [23, 1], [0, 1],
  ]);
  d.setUTCHours(hour, Math.floor(random() * 60), Math.floor(random() * 60), 0);
  return d;
}

/**
 * Day-level demand multiplier: B2B weekday/weekend swing, a gentle upward
 * trend over the window, and noise.
 */
function demandFactor(daysAgo: number): number {
  const date = dayStart(daysAgo);
  const weekday = date.getUTCDay();
  const weekendDip = weekday === 0 || weekday === 6 ? 0.45 : 1;
  // Oldest day is the smallest: spend grew ~35% across the window.
  const trend = 0.85 + ((DAYS - daysAgo) / DAYS) * 0.5;
  return weekendDip * trend * jitter(0.18);
}

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

const ANGLES = [
  { slug: "roi-calculator", name: "ROI calculator", description: "Leads with a concrete number the buyer can compute for themselves." },
  { slug: "founder-story", name: "Founder story", description: "A person explains why the product exists. Trades reach for trust." },
  { slug: "competitor-switch", name: "Competitor switch", description: "Names an incumbent and argues the move. High intent, narrow audience." },
  { slug: "free-audit", name: "Free audit or teardown", description: "Offers work up front in exchange for the conversation." },
  { slug: "social-proof", name: "Social proof", description: "Volume, logos or named results carry the claim." },
  { slug: "problem-agitate", name: "Problem agitation", description: "Dwells on the pain before naming the fix." },
  { slug: "feature-demo", name: "Feature demo", description: "Shows the product doing the thing. Converts the already-interested." },
  { slug: "time-saving", name: "Time saved", description: "Frames value as hours returned rather than money earned." },
] as const;

type AdSpec = {
  key: string;
  name: string;
  headline: string;
  primaryText: string;
  angle: (typeof ANGLES)[number]["slug"];
  /** Baseline daily spend in cents, before seasonality. */
  baseDailySpend: number;
  /** Cost per click in cents. */
  cpc: number;
  /** Click-through rate, used to derive impressions. */
  ctr: number;
  /** Probability a click eventually converts to a trial. */
  cvr: number;
  /** Only runs for the most recent N days (new creative). */
  activeDays?: number;
  note?: string;
};

type AdSetSpec = { key: string; name: string; ads: AdSpec[] };
type CampaignSpec = {
  key: string;
  name: string;
  objective: string;
  platform: Platform;
  accountKey: string;
  adSets: AdSetSpec[];
};

const CAMPAIGNS: CampaignSpec[] = [
  {
    key: "c-prospect",
    name: "Prospecting — SaaS founders",
    objective: "OUTCOME_LEADS",
    platform: "META",
    accountKey: "meta",
    adSets: [
      {
        key: "as-lookalike",
        name: "Lookalike 1% — US",
        ads: [
          {
            key: "ad-roi-calc",
            name: "ROI calc — cut CAC in half",
            headline: "See your real cost per trial",
            primaryText:
              "Most SaaS teams are reading a CAC that is 30% wrong. Run the two-minute calculator and see what your trials actually cost.",
            angle: "roi-calculator",
            baseDailySpend: 18_000,
            cpc: 310,
            ctr: 0.021,
            cvr: 0.047,
            note: "star performer — the SCALE case",
          },
          {
            key: "ad-founder",
            name: "Founder story — why we built this",
            headline: "We got tired of guessing",
            primaryText:
              "I spent two years spending $40k a month on ads I could not measure. So we built the thing I wanted.",
            angle: "founder-story",
            baseDailySpend: 11_000,
            cpc: 268,
            ctr: 0.018,
            cvr: 0.026,
          },
          {
            key: "ad-spreadsheet-pain",
            name: "Hook C — spreadsheet pain",
            headline: "Still stitching attribution in a spreadsheet?",
            primaryText:
              "Exports from four ad platforms, a VLOOKUP, and a number nobody trusts. There is a better Monday.",
            angle: "problem-agitate",
            baseDailySpend: 14_000,
            cpc: 352,
            ctr: 0.012,
            cvr: 0.002,
            note: "money pit — the CUT case",
          },
        ],
      },
      {
        key: "as-interest",
        name: "Interest — SaaS tools",
        ads: [
          {
            key: "ad-free-audit",
            name: "Free attribution audit",
            headline: "Free attribution audit",
            primaryText:
              "Send us read-only access and we will show you which of your ads are actually paying for themselves. No pitch.",
            angle: "free-audit",
            baseDailySpend: 9_500,
            cpc: 240,
            ctr: 0.024,
            cvr: 0.038,
          },
          {
            key: "ad-feature-demo",
            name: "Feature demo — 60s",
            headline: "Sixty seconds, one dashboard",
            primaryText: "Click to trial to MRR, tied back to the exact ad. Here is what that looks like.",
            angle: "feature-demo",
            baseDailySpend: 7_200,
            cpc: 221,
            ctr: 0.02,
            cvr: 0.029,
          },
          {
            key: "ad-social-proof",
            name: "Social proof — 400 SaaS teams",
            headline: "Trusted by 400+ SaaS teams",
            primaryText:
              "From seed-stage to Series B, teams use us to decide where the next $10k of ad budget goes.",
            angle: "social-proof",
            baseDailySpend: 6_400,
            cpc: 255,
            ctr: 0.016,
            cvr: 0.022,
          },
        ],
      },
    ],
  },
  {
    key: "c-retarget",
    name: "Retargeting — site visitors",
    objective: "OUTCOME_SALES",
    platform: "META",
    accountKey: "meta",
    adSets: [
      {
        key: "as-visitors",
        name: "Site visitors 30d",
        ads: [
          {
            key: "ad-finish-setup",
            name: "Retarget — finish your setup",
            headline: "Your pixel is 4 minutes from live",
            primaryText: "You started. One script tag and your real numbers appear.",
            angle: "time-saving",
            baseDailySpend: 4_100,
            cpc: 178,
            ctr: 0.034,
            cvr: 0.072,
          },
          {
            key: "ad-roi-reminder",
            name: "Retarget — ROI calc reminder",
            headline: "You left the calculator open",
            primaryText: "Two minutes to find out what a trial really costs you.",
            angle: "roi-calculator",
            baseDailySpend: 3_300,
            cpc: 165,
            ctr: 0.031,
            cvr: 0.058,
          },
          {
            key: "ad-case-study",
            name: "Retarget — case study",
            headline: "How Loop cut CAC 38%",
            primaryText: "They did not spend less. They spent it on the three ads that were working.",
            angle: "social-proof",
            baseDailySpend: 2_300,
            cpc: 192,
            ctr: 0.028,
            cvr: 0.04,
            activeDays: 11,
            note: "new creative, tiny sample — the TOO EARLY case",
          },
        ],
      },
    ],
  },
  {
    key: "c-search",
    name: "Search — brand + competitor",
    objective: "SEARCH",
    platform: "GOOGLE",
    accountKey: "google",
    adSets: [
      {
        key: "as-competitor",
        name: "Competitor terms",
        ads: [
          {
            key: "ad-vs-hyros",
            name: "Competitor switch — vs Hyros",
            headline: "A clearer Hyros alternative",
            primaryText: "Same server-side tracking. Plain pricing, and it tells you when the data is too thin to act on.",
            angle: "competitor-switch",
            baseDailySpend: 12_500,
            cpc: 865,
            ctr: 0.061,
            cvr: 0.055,
          },
          {
            key: "ad-vs-triplewhale",
            name: "Competitor switch — vs Triple Whale",
            headline: "Built for SaaS, not just Shopify",
            primaryText: "Attribution that understands trials, MRR and pipeline — not just orders.",
            angle: "competitor-switch",
            baseDailySpend: 8_900,
            cpc: 790,
            ctr: 0.054,
            cvr: 0.043,
          },
        ],
      },
      {
        key: "as-brand",
        name: "Brand terms",
        ads: [
          {
            key: "ad-brand",
            name: "Brand — trueroas",
            headline: "TrueROAS — official site",
            primaryText: "Marketing attribution and AI analytics for B2B SaaS.",
            angle: "feature-demo",
            baseDailySpend: 1_900,
            cpc: 142,
            ctr: 0.18,
            cvr: 0.121,
          },
        ],
      },
    ],
  },
];

const CLICK_ID_BY_PLATFORM: Partial<Record<Platform, ClickIdType>> = {
  META: "FBCLID",
  GOOGLE: "GCLID",
  TIKTOK: "TTCLID",
  LINKEDIN: "LI_FAT_ID",
  MICROSOFT: "MSCLKID",
};

const LANDING_PAGES = [
  "/",
  "/pricing",
  "/attribution-for-saas",
  "/vs/hyros",
  "/roi-calculator",
  "/blog/what-your-cac-is-really-costing-you",
];

const FIRST_NAMES = ["jane", "amir", "priya", "tom", "lena", "chen", "marco", "sofia", "noah", "ada", "ravi", "ines", "oskar", "mei", "diego", "hanna"];
const COMPANIES = ["northwind", "loopkit", "cadence", "paperplane", "fernway", "oakbase", "runlevel", "quartzhq", "beacon", "tidepool", "mallard", "orbitlane"];

/** MRR tiers, weighted toward the lower plans as real SaaS mixes are. */
const MRR_TIERS = [
  [4_900, 8],
  [9_900, 10],
  [24_900, 5],
  [49_900, 2],
] as const;

// --------------------------------------------------------------------------
// Seed
// --------------------------------------------------------------------------

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

type Totals = {
  spendCents: number;
  impressions: number;
  clicks: number;
  touches: number;
  visitors: number;
  conversions: number;
  mrrCents: number;
};

async function main() {
  const emailArg = process.argv.indexOf("--email");
  const attachToEmail = emailArg > -1 ? process.argv[emailArg + 1] : undefined;

  console.log("Seeding demo data…\n");

  // --- Global angle taxonomy (shared across all workspaces) ---------------
  for (const angle of ANGLES) {
    await db.angle.upsert({
      where: { slug: angle.slug },
      create: angle,
      update: { name: angle.name, description: angle.description },
    });
  }
  const angleIds = new Map(
    (await db.angle.findMany({ select: { id: true, slug: true } })).map((a) => [a.slug, a.id]),
  );
  console.log(`  ✓ ${ANGLES.length} creative angles`);

  // --- Owner org ----------------------------------------------------------
  let orgId: string;

  if (attachToEmail) {
    const user = await db.user.findUnique({
      where: { email: attachToEmail.toLowerCase() },
      select: { memberships: { select: { orgId: true }, take: 1 } },
    });
    if (!user?.memberships[0]) {
      throw new Error(
        `No account found for ${attachToEmail}. Sign up first, then re-run with --email.`,
      );
    }
    orgId = user.memberships[0].orgId;
    console.log(`  ✓ attaching demo workspace to ${attachToEmail}`);
  } else {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const user = await db.user.upsert({
      where: { email: DEMO_EMAIL },
      create: { email: DEMO_EMAIL, name: "Demo User", passwordHash },
      update: { passwordHash },
      select: { id: true, memberships: { select: { orgId: true }, take: 1 } },
    });

    if (user.memberships[0]) {
      orgId = user.memberships[0].orgId;
    } else {
      const org = await db.organization.create({
        data: {
          name: "Acme (demo)",
          plan: "GROWTH",
          planStatus: "ACTIVE",
          benchmarkOptIn: true,
          memberships: { create: { userId: user.id, role: "OWNER" } },
        },
        select: { id: true },
      });
      orgId = org.id;
    }
    console.log(`  ✓ demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }

  // --- Workspace (recreated each run so the seed is repeatable) -----------
  const existing = await db.workspace.findUnique({
    where: { slug: DEMO_SLUG },
    select: { id: true },
  });
  if (existing) {
    // Cascades clear every child row: touches, conversions, spend, ads.
    await db.workspace.delete({ where: { id: existing.id } });
    console.log("  ✓ cleared the previous demo workspace");
  }

  const workspace = await db.workspace.create({
    data: {
      orgId,
      name: "Acme (demo)",
      slug: DEMO_SLUG,
      category: "B2B SaaS — Marketing tools",
      currency: "USD",
      timezone: "America/New_York",
      targetCacCents: 18_000, // $180 target CAC
      lookbackDays: 90,
      isDemo: true,
    },
    select: { id: true, pixelKey: true },
  });
  const wsId = workspace.id;

  // --- Ad accounts, campaigns, ad sets, ads -------------------------------
  const accounts = {
    meta: await db.adAccount.create({
      data: {
        workspaceId: wsId,
        platform: "META",
        externalAccountId: "act_882104077",
        name: "Acme — Meta Ads",
        source: "SEED",
        connectionStatus: "CONNECTED",
        lastSyncedAt: new Date(),
      },
      select: { id: true },
    }),
    google: await db.adAccount.create({
      data: {
        workspaceId: wsId,
        platform: "GOOGLE",
        externalAccountId: "412-889-2301",
        name: "Acme — Google Ads",
        source: "SEED",
        connectionStatus: "CONNECTED",
        lastSyncedAt: new Date(),
      },
      select: { id: true },
    }),
  };

  type ResolvedAd = { id: string; spec: AdSpec; adSetId: string; campaignId: string; platform: Platform };
  const ads: ResolvedAd[] = [];

  for (const campaignSpec of CAMPAIGNS) {
    const campaign = await db.campaign.create({
      data: {
        workspaceId: wsId,
        adAccountId: accounts[campaignSpec.accountKey as keyof typeof accounts].id,
        externalId: `cmp_${campaignSpec.key}`,
        name: campaignSpec.name,
        objective: campaignSpec.objective,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    for (const adSetSpec of campaignSpec.adSets) {
      const adSet = await db.adSet.create({
        data: {
          workspaceId: wsId,
          campaignId: campaign.id,
          externalId: `as_${adSetSpec.key}`,
          name: adSetSpec.name,
          status: "ACTIVE",
        },
        select: { id: true },
      });

      for (const spec of adSetSpec.ads) {
        const ad = await db.ad.create({
          data: {
            workspaceId: wsId,
            adSetId: adSet.id,
            campaignId: campaign.id,
            externalId: `ad_${spec.key}`,
            name: spec.name,
            status: "ACTIVE",
            headline: spec.headline,
            primaryText: spec.primaryText,
            landingPageUrl: `https://acme.example.com${pick(LANDING_PAGES)}`,
            angleId: angleIds.get(spec.angle),
            angleConfidence: between(0.78, 0.97).toFixed(3),
            angleHook: spec.headline,
            angleTaggedAt: new Date(),
          },
          select: { id: true },
        });

        ads.push({
          id: ad.id,
          spec,
          adSetId: adSet.id,
          campaignId: campaign.id,
          platform: campaignSpec.platform,
        });
      }
    }
  }
  console.log(`  ✓ ${CAMPAIGNS.length} campaigns, ${ads.length} ads`);

  // --- Daily spend + the clicks that spend bought -------------------------
  const totals: Totals = {
    spendCents: 0, impressions: 0, clicks: 0,
    touches: 0, visitors: 0, conversions: 0, mrrCents: 0,
  };

  // Typed against the generated inputs rather than cast: a typo in a field name
  // here would otherwise produce silently wrong demo data.
  const spendRows: Prisma.SpendDailyCreateManyInput[] = [];
  const visitorRows: Prisma.VisitorCreateManyInput[] = [];
  const touchRows: Prisma.TouchCreateManyInput[] = [];
  const conversionRows: Prisma.ConversionCreateManyInput[] = [];

  /** Visitors available for a repeat visit, so some paths are multi-touch. */
  const returningPool: { id: string; firstSeenAt: Date }[] = [];
  /** Visitors who converted to a trial, eligible to later become paying. */
  const trialed: { visitorId: string; email: string; daysAgo: number }[] = [];

  let visitorSeq = 0;
  let touchSeq = 0;
  let conversionSeq = 0;

  // A deliberate tracking gap for the health page to find: Google click ids
  // vanish for three days in the middle of the window.
  const gapStart = 46;
  const gapEnd = 44;

  for (let daysAgo = DAYS - 1; daysAgo >= 0; daysAgo--) {
    const factor = demandFactor(daysAgo);

    for (const ad of ads) {
      // Newer creatives have not been running the whole window.
      if (ad.spec.activeDays !== undefined && daysAgo >= ad.spec.activeDays) continue;

      const spendCents = Math.round(ad.spec.baseDailySpend * factor);
      if (spendCents <= 0) continue;

      const clicks = Math.max(0, Math.round((spendCents / ad.spec.cpc) * jitter(0.12)));
      const impressions = Math.round(clicks / ad.spec.ctr);

      spendRows.push({
        workspaceId: wsId,
        level: "AD",
        entityKey: `ad:${ad.id}`,
        date: dayStart(daysAgo),
        platform: ad.platform,
        adId: ad.id,
        adSetId: ad.adSetId,
        campaignId: ad.campaignId,
        spendCents,
        impressions,
        clicks,
        // What the platform claims. Always optimistic relative to what we can
        // verify, which is the discrepancy the health page surfaces.
        platformConversions: Math.round(clicks * ad.spec.cvr * between(1.15, 1.55)),
        currency: "USD",
      });

      totals.spendCents += spendCents;
      totals.impressions += impressions;
      totals.clicks += clicks;

      const inTrackingGap =
        ad.platform === "GOOGLE" && daysAgo <= gapStart && daysAgo >= gapEnd;

      for (let c = 0; c < clicks; c++) {
        const occurredAt = timeWithinDay(daysAgo);

        // 22% of clicks are someone we have already seen.
        const reuse = returningPool.length > 40 && random() < 0.22;
        let visitorId: string;

        if (reuse) {
          const prior = returningPool[Math.floor(random() * returningPool.length)]!;
          visitorId = prior.id;
        } else {
          visitorId = `dv_${visitorSeq++}`;
          visitorRows.push({
            id: visitorId,
            workspaceId: wsId,
            anonId: `anon_${visitorId}`,
            firstSeenAt: occurredAt,
            lastSeenAt: occurredAt,
            identifiedEmail: null,
          });
          returningPool.push({ id: visitorId, firstSeenAt: occurredAt });
          totals.visitors++;
        }

        const clickIdType = inTrackingGap ? "NONE" : (CLICK_ID_BY_PLATFORM[ad.platform] ?? "NONE");
        const touchId = `dt_${touchSeq++}`;
        const landing = pick(LANDING_PAGES);

        touchRows.push({
          id: touchId,
          workspaceId: wsId,
          visitorId,
          occurredAt,
          landingUrl: `https://acme.example.com${landing}`,
          referrer: ad.platform === "GOOGLE" ? "https://www.google.com/" : "https://www.facebook.com/",
          utmSource: ad.platform.toLowerCase(),
          utmMedium: "cpc",
          utmCampaign: ad.spec.key,
          utmContent: ad.spec.name,
          clickId: clickIdType === "NONE" ? null : `${clickIdType.toLowerCase()}_${touchId}`,
          clickIdType,
          platform: ad.platform,
          externalAdId: `ad_${ad.spec.key}`,
          adId: ad.id,
          adSetId: ad.adSetId,
          campaignId: ad.campaignId,
          deviceType: pickWeighted([["DESKTOP", 6], ["MOBILE", 5], ["TABLET", 1]] as const),
          country: pickWeighted([["US", 10], ["GB", 3], ["CA", 2], ["DE", 2], ["AU", 1], ["IN", 2]] as const),
          ipHash: `h_${Math.floor(random() * 1e12).toString(36)}`,
        });
        totals.touches++;

        // Does this click eventually produce a trial or demo?
        if (random() < ad.spec.cvr) {
          const name = pick(FIRST_NAMES);
          const company = pick(COMPANIES);
          const email = `${name}@${company}.example.com`;
          // Conversions lag the click by 0-6 days, never into the future.
          const lag = Math.min(daysAgo, Math.floor(between(0, 7)));
          const convertedAt = timeWithinDay(daysAgo - lag);

          const eventType: ConversionType = random() < 0.78 ? "TRIAL" : "DEMO";
          const id = `dc_${conversionSeq++}`;

          conversionRows.push({
            id,
            workspaceId: wsId,
            visitorId,
            eventName: eventType === "TRIAL" ? "trial_started" : "demo_requested",
            eventType,
            occurredAt: convertedAt,
            valueCents: 0,
            currency: "USD",
            email,
            source: "API",
            dedupeKey: `demo:${id}`,
          });
          totals.conversions++;

          if (eventType === "TRIAL") {
            trialed.push({ visitorId, email, daysAgo: daysAgo - lag });
          }
        }
      }
    }

    // --- Organic and direct traffic: not everything is attributable -------
    const organicVisits = Math.round(between(22, 46) * factor);
    for (let i = 0; i < organicVisits; i++) {
      const occurredAt = timeWithinDay(daysAgo);
      const visitorId = `dv_${visitorSeq++}`;
      visitorRows.push({
        id: visitorId,
        workspaceId: wsId,
        anonId: `anon_${visitorId}`,
        firstSeenAt: occurredAt,
        lastSeenAt: occurredAt,
        identifiedEmail: null,
      });
      totals.visitors++;

      const [platform, referrer] = pickWeighted([
        [["ORGANIC", "https://www.google.com/"] as const, 6],
        [["DIRECT", null] as const, 4],
        [["REFERRAL", "https://news.ycombinator.com/"] as const, 2],
        [["EMAIL", null] as const, 1],
      ]);

      const touchId = `dt_${touchSeq++}`;
      touchRows.push({
        id: touchId,
        workspaceId: wsId,
        visitorId,
        occurredAt,
        landingUrl: `https://acme.example.com${pick(LANDING_PAGES)}`,
        referrer,
        utmSource: platform === "EMAIL" ? "newsletter" : null,
        utmMedium: platform === "EMAIL" ? "email" : null,
        clickId: null,
        clickIdType: "NONE",
        platform,
        deviceType: pickWeighted([["DESKTOP", 6], ["MOBILE", 5], ["TABLET", 1]] as const),
        country: pickWeighted([["US", 10], ["GB", 3], ["CA", 2], ["DE", 2], ["IN", 2]] as const),
        ipHash: `h_${Math.floor(random() * 1e12).toString(36)}`,
      });
      totals.touches++;

      // Organic converts too, at a lower rate.
      if (random() < 0.013) {
        const email = `${pick(FIRST_NAMES)}@${pick(COMPANIES)}.example.com`;
        const id = `dc_${conversionSeq++}`;
        conversionRows.push({
          id,
          workspaceId: wsId,
          visitorId,
          eventName: "trial_started",
          eventType: "TRIAL",
          occurredAt,
          valueCents: 0,
          currency: "USD",
          email,
          source: "API",
          dedupeKey: `demo:${id}`,
        });
        totals.conversions++;
        trialed.push({ visitorId, email, daysAgo });
      }
    }
  }

  // --- Trials that became paying subscriptions ----------------------------
  // ~31% of trials convert, 7-21 days after starting.
  for (const trial of trialed) {
    if (random() > 0.31) continue;
    const lag = Math.floor(between(7, 22));
    if (lag > trial.daysAgo) continue; // would land in the future

    const mrrCents = pickWeighted(MRR_TIERS);
    const id = `dc_${conversionSeq++}`;

    conversionRows.push({
      id,
      workspaceId: wsId,
      visitorId: trial.visitorId,
      eventName: "subscription_started",
      eventType: "SUBSCRIPTION",
      occurredAt: timeWithinDay(trial.daysAgo - lag),
      valueCents: mrrCents,
      mrrCents,
      currency: "USD",
      email: trial.email,
      source: "STRIPE",
      dedupeKey: `demo:${id}`,
    });
    totals.conversions++;
    totals.mrrCents += mrrCents;
  }

  // --- Write it all -------------------------------------------------------
  await db.spendDaily.createMany({ data: spendRows });
  console.log(`  ✓ ${spendRows.length.toLocaleString()} daily spend rows`);

  // A visitor who converted handed us an email, so carry it onto the visitor
  // row — that is the anonymous-to-known stitch the product does for real.
  const emailByVisitor = new Map<string, string>();
  for (const row of conversionRows) {
    const email = row.email ?? undefined;
    const visitorId = row.visitorId ?? undefined;
    if (email && visitorId && !emailByVisitor.has(visitorId)) {
      emailByVisitor.set(visitorId, email);
    }
  }
  for (const visitor of visitorRows) {
    if (visitor.id) visitor.identifiedEmail = emailByVisitor.get(visitor.id) ?? null;
  }

  await insertInChunks("visitors", visitorRows, (chunk) =>
    db.visitor.createMany({ data: chunk }),
  );
  await insertInChunks("touches", touchRows, (chunk) =>
    db.touch.createMany({ data: chunk }),
  );
  await insertInChunks("conversions", conversionRows, (chunk) =>
    db.conversion.createMany({ data: chunk }),
  );

  // --- Summary ------------------------------------------------------------
  const dollars = (cents: number) =>
    `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  const subs = conversionRows.filter((r) => r.eventType === "SUBSCRIPTION").length;
  const trials = conversionRows.filter((r) => r.eventType === "TRIAL").length;
  const blendedCac = trials > 0 ? totals.spendCents / trials : 0;

  console.log(`
Demo workspace ready.

  Workspace     Acme (demo)   /app/${DEMO_SLUG}
  Pixel key     ${workspace.pixelKey}
  Window        last ${DAYS} days
  Target CAC    $180.00

  Spend         ${dollars(totals.spendCents)} across ${ads.length} ads
  Impressions   ${totals.impressions.toLocaleString()}
  Clicks        ${totals.clicks.toLocaleString()}
  Visitors      ${totals.visitors.toLocaleString()}
  Touches       ${totals.touches.toLocaleString()}
  Trials        ${trials.toLocaleString()}
  Demos         ${(totals.conversions - trials - subs).toLocaleString()}
  Subscriptions ${subs.toLocaleString()}  (${dollars(totals.mrrCents)} MRR)
  Blended CAC   ${dollars(blendedCac)} per trial

  Planted on purpose:
    - "ROI calc — cut CAC in half"   strong volume, low CAC   -> SCALE
    - "Hook C — spreadsheet pain"    high spend, ~no trials   -> CUT
    - "Retarget — case study"        11 days old, tiny sample -> TOO EARLY
    - Google click ids missing for 3 days  -> a tracking-health finding
    - Platform-reported conversions run 15-55% above tracked -> discrepancy

  Attribution credit is not seeded: the Phase 1 engine computes it from these
  touches and conversions, so the seed cannot mask a bug in it.
`);
}

/** createMany in batches, so one statement never carries 10k rows. */
async function insertInChunks<T>(
  label: string,
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
  size = 2_000,
) {
  for (let i = 0; i < rows.length; i += size) {
    await insert(rows.slice(i, i + size));
  }
  console.log(`  ✓ ${rows.length.toLocaleString()} ${label}`);
}

main()
  .catch((error) => {
    console.error("\nSeed failed:\n", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
