# TrueROAS — Marketing Attribution + AI Analytics for B2B SaaS

*(working product name; lives in one config file, swap any time)*

## Context

**Why we're building this.** Cometly does ~$200k/mo doing one thing: telling SaaS
advertisers which specific ad produced which specific dollar of revenue — then
pushing those conversions back to the ad platforms so their optimizers stop
guessing. The demand is proven. Pricing in the category is custom/opaque
(Hyros from $230/mo, Triple Whale $149–199+, Cometly "contact us"), which means
there is room to enter with a clear price and a sharper product.

**The commercial constraint shapes the build.** Target is ₹5L/mo (~$6k MRR)
within 60–90 days. At $399/mo that is ~15 customers; at $99 it would be ~57.
Fifteen is reachable with outbound, fifty-seven is not. So this is a
**higher-ticket, fewer-logos product**: it has to feel premium, support agencies,
and carry features worth paying a premium for. Every phase below is ordered by
"what gets a paying customer soonest", not by what's easiest to code.

**The key unblock.** Meta/Google Marketing API access needs weeks of app review
— but we don't need it to deliver real value. Click IDs (`fbclid`, `gclid`)
arrive in the landing URL for free, and Stripe gives us real revenue. So v1
attributes **real money to real ads** with only our own pixel + Stripe, taking
ad *spend* via CSV/Sheets import. Platform APIs drop in behind an adapter
interface in week 3–4 with zero rework.

**Outcome:** a running local app this weekend, 3–5 paying design partners in
week 2, and the feature set to defend $399/mo by week 4.

---

## Locked decisions

| Decision | Choice |
|---|---|
| Customer | B2B SaaS advertisers (conversions = trial/demo/subscription; revenue = MRR/LTV) |
| Market & pricing | Global, USD — $199 / $399 / $799, annual −20% |
| Ad spend ingest (v1) | Seeded demo + CSV/Sheets import behind `AdPlatformAdapter`; real Meta/Google adapters land W3–4 |
| Stack | Next.js 15 (App Router) · TypeScript · Tailwind · Postgres (Neon) · Prisma · Auth.js credentials · Stripe · `@anthropic-ai/sdk` · Recharts · Vitest + Playwright |
| Winning-ads moat | AI angle-extraction on the user's own ads + **opt-in** anonymized category benchmarks |
| Sequencing | Weekend = core loop → week 2 = charge design partners → W3–4 = rest |
| Multi-tenancy | Org → Workspaces from the first migration (1 workspace = solo SaaS, many = agency) |
| Branch | `claude/laughing-pasteur-jztz4t` |

---

## The core loop (build this end to end before anything else)

```
Ad click            → lands on site with ?fbclid=...&utm_campaign=...
  ↓  t.js pixel (first-party, our domain)
Touch recorded      → visitor cookie + click ID + UTMs + timestamp
  ↓  visitor browses, signs up
Conversion ingested → Stripe webhook / POST /api/v1/conversions / pixel event
  ↓  attribution engine (lookback 90d)
Attribution rows    → credit split per model, joined to ad → adset → campaign
  ↓  + CSV spend
Dashboard           → true CAC / ROAS on MRR, per ad
  ↓  AI layer
Daily Action Brief  → ranked Scale / Cut / Watch with projected $ impact
```

**Definition of done for the loop:** a simulated click carrying `fbclid`
followed by a conversion appears on the dashboard, attributed to the right ad,
with a CAC number and a confidence interval. One Playwright test guards exactly
this path forever.

---

## Architecture

```
app/
  (marketing)/            landing, /pricing, /login, /signup
  (app)/[workspace]/      dashboard · ads · conversions · insights · chat
                          angles · health · reports · settings/*
  r/[token]/              public read-only client report (no auth)
  api/
    t/collect             pixel event ingest (hot path, edge runtime)
    t/identify            anon visitor → email stitch
    v1/conversions        server-side conversion ingest (API key auth)
    webhooks/stripe-billing     our own subscriptions
    webhooks/stripe-conversions per-workspace customer revenue
    chat                  streaming AI chat (tool-use)
    cron/*                nightly jobs
lib/
  attribution/            models.ts · engine.ts · lookback.ts
  stats/                  confidence.ts   (pure, no deps, heavily tested)
  adapters/               types.ts · seed.ts · csv.ts · meta.ts (W3) · google.ts (W4)
  ai/                     brief.ts · chat-tools.ts · angles.ts · prompts/
  health/                 checks.ts · anomalies.ts
  billing/                plans.ts · gating.ts
  db.ts  auth.ts  dedupe.ts  clickids.ts
public/t.js               the pixel (<3KB, no deps, sendBeacon)
prisma/schema.prisma
scripts/seed-demo.ts      90 days of realistic data = every screen alive + sales demo
```

### Data model (Prisma, Postgres)

**Identity & tenancy** — `User` (email + bcrypt hash) · `Organization` (plan,
`stripeCustomerId`, `benchmarkOptIn`) · `Membership` (role: OWNER/ADMIN/MEMBER/VIEWER)
· `Workspace` (`orgId`, `slug`, `category`, `timezone`, `currency`, `targetCacCents`,
unique `pixelKey`) · `ApiKey` (hashed).

**Tracking** —
- `Visitor` — `workspaceId`, `anonId` (1st-party cookie), `identifiedEmail?`, first/last seen
- `Touch` — `visitorId`, `occurredAt`, landing URL, referrer, 5 UTMs, `clickId`,
  `clickIdType` (FBCLID/GCLID/TTCLID/LI_FAT_ID/MSCLKID/NONE), `platform`,
  `adId? adsetId? campaignId?`, device, country, `ipHash` (never raw IP)
  — indexes on `(workspaceId, occurredAt)`, `(visitorId, occurredAt)`, `(clickId)`
- `Conversion` — `eventName`, `eventType` (SIGNUP/TRIAL/DEMO/QUALIFIED/PURCHASE/
  SUBSCRIPTION/EXPANSION/CHURN), `valueCents`, `mrrCents?`, `source`, `rawPayload`,
  unique `dedupeKey`
- `Attribution` — `conversionId` × `touchId` × `model`, `creditFraction`,
  `creditedValueCents`, denormalized `adId/campaignId/platform`;
  unique `(conversionId, touchId, model)`. **Precomputed per model** so every
  dashboard query is a plain aggregate, not a graph walk.

**Ad data** — `AdAccount` (platform, `source`: SEED/CSV/API, encrypted creds ref)
· `Campaign` → `AdSet` → `Ad` (name, headline, primary text, thumb, `angleId?`)
· `SpendDaily` (`adId?`/`campaignId`, `date`, spendCents, impressions, clicks,
`platformConversions?`) — unique per entity+date, upsert-safe for re-imports.

**Intelligence** — `Angle` (global taxonomy) · `Benchmark` (category × angle ×
metric, median/p25/p75, `sampleSize`) · `Insight` (kind: SCALE/CUT/WATCH/ANOMALY/
ANGLE_SUGGESTION/HEALTH, `projectedImpactCents`, `confidence`, status) ·
`ChatThread`/`ChatMessage` · `HealthSnapshot` · `AlertRule`/`AlertEvent` ·
`SavedView` (search/filter persistence) · `ShareLink` (token, expiry, scope) ·
`AuditLog`.

### Attribution engine (`lib/attribution/`)

On conversion ingest: load that visitor's touches within the lookback window
(default 90d, per-workspace), keep paid touches (has click ID or UTM), compute
credit under all five models, write `Attribution` rows. Idempotent per
`(conversionId, model)` so replays and backfills are safe.

Models: **last-click, first-click, linear, time-decay** (7-day half-life),
**position-based** (40/20/40). Credit fractions must sum to 1.0 — that's a test.

The differentiator is the **Model Disagreement view**: same period, same ad,
credited revenue under each model side by side, with a "last-click is
under-crediting this campaign by 61%" callout. Competitors make you pick a model
and trust it; we show you where the choice is load-bearing.

### Confidence layer (`lib/stats/confidence.ts`)

Pure function, zero dependencies, the most-tested file in the repo:

```
cacInterval({ conversions, spendCents, prior }) → { point, lo, hi, n, verdict }
```

Conversions as Poisson with rate λ per dollar; Gamma(α₀+n, β₀+spend) posterior;
invert quantiles to a 95% credible interval on CAC. Verdict vs the workspace's
`targetCacCents`: `LIKELY_GOOD` / `LIKELY_BAD` / `TOO_EARLY`.

```
CAC $94  (95% CI $61–$210)   n=11  → LIKELY GOOD — scale
CAC $310 (95% CI $88–$2,400) n=2   → TOO EARLY — hold, needs ~6 more conversions
```

That last clause — *how much more data until you can decide* — is the bit people
will screenshot. Nothing in this category does it.

### AI layer (`lib/ai/`) — Claude via `@anthropic-ai/sdk`

**Hard rule: the model never invents a number.** All metrics are computed in
TypeScript and passed in as a compact JSON digest; the model ranks, explains and
writes. Projected impact is arithmetic in code, not a guess.

1. **Daily Action Brief** (`brief.ts`, nightly cron) — digest of per-ad spend,
   conversions, CAC + CI, 14-day trend → ranked Scale / Cut / Watch list, each
   with reasoning and `projectedImpactCents`. Writes `Insight` rows; rendered
   in-app and emailed. Acknowledge/dismiss/mark-actioned feeds a weekly
   "decisions you made and what they saved" recap — the renewal argument.
2. **Chat** (`chat-tools.ts`) — tool-use over a **typed query layer, not raw SQL**:
   `query_ad_performance({dateRange, platform, groupBy, model, limit})`,
   `query_conversions`, `compare_models`, `get_tracking_health`,
   `get_angle_benchmarks`. Bounded rows, no injection surface, cheap. Streams.
3. **Angle extraction** (`angles.ts`) — batch-tags each ad into a fixed taxonomy
   (ROI-calculator, founder-story, competitor-switch, free-audit, social-proof,
   fear-of-switching-cost…) with confidence + extracted hook. Cached by hash of
   ad text, so re-runs cost nothing.
4. **Angle suggestions** (the moat) — your winning angles vs category medians
   from opt-in anonymized benchmarks, plus 3 ready-to-run ad concepts in an
   untested winning angle. Benchmarks require **≥5 contributing accounts**
   per cell and carry no PII — enforced in the aggregation query, not in policy.

Model routing: Opus for the nightly brief and angle concepts (quality, runs
once), Sonnet for chat and tagging (volume). Cost per workspace per month is
a few cents to low dollars — track it in `AuditLog` so pricing stays honest.

---

## Phase plan

### Phase 0 — Foundation (2–3 h)
1. `create-next-app` (TS, App Router, Tailwind), ESLint/Prettier, Vitest, `.env.example`
2. Neon Postgres + Prisma; full schema above in **one** initial migration
3. Auth.js credentials provider (bcrypt), signup/login/logout, session, org+workspace
   created on signup, route protection, `requireWorkspaceAccess()` helper used by
   **every** app route and API handler
4. App shell: sidebar, workspace switcher, dark mode, empty-state component
5. `scripts/seed-demo.ts` — 90 days, 3 campaigns / 12 ads / ~400 conversions with
   seasonality and one deliberately broken ad. *Do this early: it's also the sales demo.*

### Phase 1 — Core loop (the weekend, 6–8 h) ← **ship this first**
6. `public/t.js` — click-ID + UTM capture, 1st-party cookie, `sendBeacon`, SPA
   route changes, <3KB; `POST /api/t/collect` (edge) → `Touch`; `/api/t/identify`
7. `POST /api/v1/conversions` — API-key auth, idempotency key, `dedupeKey`, validation
8. `lib/attribution/` — all five models + engine, **TDD, written test-first**
9. `/webhooks/stripe-conversions` — per-workspace signing secret; `invoice.paid`,
   `customer.subscription.created` → `Conversion` with `mrrCents`
10. CSV/Sheets spend import — upload → column mapper → preview → upsert `SpendDaily`;
    downloadable sample CSV; the `AdPlatformAdapter` interface defined here
11. **Dashboard** — spend / attributed revenue / CAC / ROAS-on-MRR / LTV:CAC,
    trend chart, top-and-bottom ads table, model switcher
12. `/ads` — per-ad table with CAC + confidence interval + verdict, search,
    date range, platform/campaign filters, saved views
13. `/conversions` — the history list: searchable, filterable, paginated; each row
    expands to its full touch path ("here are the 4 ads this customer saw")
14. **Empty states everywhere**, each with the one action that fixes it: pixel
    snippet with a live "waiting for your first event…" detector; copy-paste
    `curl` for a test conversion; sample CSV; "explore the demo workspace" button

### Phase 2 — Paid + the trust features (week 2) → **first revenue**
15. Daily Action Brief (nightly cron + `/insights` history + ack/dismiss)
16. Chat with tool-use, streaming, suggested starter questions, thread history
17. **Tracking Health** page — pixel firing?, events/24h, which click IDs are
    arriving, platform-reported vs tracked discrepancy %, "no `gclid` in 36h —
    auto-tagging may be off". Plus spend/CPA anomaly alerts (email + in-app).
18. Stripe billing: Checkout, three prices + annual, 14-day trial no card,
    customer portal, billing webhook → plan status, `lib/billing/gating.ts`
    enforced server-side on every gated route
19. Landing page + `/pricing`: the loop as a 4-step visual, a real screenshot of
    the brief, the confidence-interval screenshot, FAQ that names Hyros/Triple
    Whale/Cometly honestly, demo-workspace CTA
20. README (setup, env vars, deploy), transactional email (Resend)
21. **Onboard 3–5 design partners at a founding discount.** Build W3–4 against
    what they complain about.

### Phase 3 — Moat + platform APIs (weeks 3–4)
22. Angle extraction over all ads + `/angles` page: your angle leaderboard
23. Anonymized category benchmarks (nightly aggregation, ≥5-account floor,
    opt-in toggle in settings with plain-English explanation of what is shared)
24. Angle suggestions + 3 generated ad concepts per untested winning angle
25. **Meta adapter** (app review filed on day 1 of Phase 1 — long lead item):
    OAuth, campaign/adset/ad + daily spend sync, token refresh
26. **Conversions API push-back** — send attributed conversions to Meta CAPI
    (hashed email, `fbclid`, event ID dedupe) and Google offline conversions.
    This is the "why we're better than a spreadsheet" feature.
27. Client reports: `/r/[token]` public read-only, scheduled weekly digests,
    white-label logo for Agency tier
28. Model Disagreement view · cohort LTV-by-ad curves
29. Google adapter · HubSpot pipeline-stage attribution

### Phase 4 — Growth (week 5+)
30. Self-serve onboarding polish, in-app checklist, usage metering vs plan caps
31. Weekly "decisions → savings" recap email (retention)
32. Outbound to SaaS spending $20k+/mo: free attribution-audit offer using the
    demo workspace as the pitch; target 15–25 customers

---

## Pricing & gating (`lib/billing/plans.ts`)

| | Starter $199 | Growth $399 | Agency $799 |
|---|---|---|---|
| Workspaces | 1 | 3 | 15 |
| Tracked events/mo | 50k | 250k | 1M |
| Attribution models | last + first click | all 5 + disagreement view | all 5 |
| Daily Action Brief | ✅ | ✅ | ✅ |
| Tracking Health + alerts | ✅ | ✅ | ✅ |
| Confidence layer | — | ✅ | ✅ |
| AI chat | 50 msg/mo | unlimited | unlimited |
| Angles + benchmarks | — | ✅ | ✅ |
| Conversions API push-back | — | ✅ | ✅ |
| Client reports / white-label | — | links | white-label + team roles |
| API access | — | — | ✅ |

14-day trial, no card. Annual −20% (cash up front matters at this stage).
All gates enforced server-side; the UI shows locked features as upgrade prompts
rather than hiding them.

---

## Verification

Run after each phase; Phase 1's e2e is the one that must never go red.

```bash
npm run dev                      # app on :3000
npx prisma migrate dev           # schema
npm run seed:demo                # realistic 90-day workspace
npm test                         # Vitest unit
npm run test:e2e                 # Playwright
npx prisma studio                # inspect rows directly
```

**Unit (TDD — tests first):**
- credit fractions sum to 1.0 for every model, including single-touch and 50-touch paths
- `cacInterval`: n=0, n=1, huge n, zero spend; interval narrows as n grows; verdicts flip at the target boundary
- click-ID parsing for all five platforms + no-click-ID case
- `dedupeKey`: same conversion twice → one row
- CSV mapper: messy headers, wrong date formats, currency symbols, re-import idempotency
- plan gating: each gated feature refuses on the tier below it

**E2E (the core-loop guard):** signup → create workspace → copy pixel snippet →
simulated visit with `?fbclid=test123&utm_campaign=...` → `POST /api/v1/conversions`
with `mrrCents` → dashboard shows 1 conversion attributed to the right ad with a
CAC and a `TOO_EARLY` verdict → `/conversions` row expands to the touch path.

**Manual smoke per phase:** every empty state reachable and its CTA works;
Stripe test-mode checkout → plan unlocks → portal cancel → plan locks;
pixel verified on a real external page via ngrok; brief generated from seed data
reads like something a human would act on; chat answers "which ad has the best
CAC this month?" with numbers matching the dashboard exactly.

**Deploy (end of week 2):** Vercel + Neon, `vercel.json` crons, Stripe webhooks
pointed at production, `t.js` cache headers + CORS, custom domain (pixel must be
first-party), Stripe live keys only after a test-mode end-to-end passes.

---

## Risks and how we handle them

| Risk | Handling |
|---|---|
| Meta/Google app review slips | File day 1; CSV import means revenue never waits on it |
| Benchmarks useless until there's volume | Seeded industry priors + clearly labelled `n=`; cell hidden below 5 accounts |
| Attribution is never literally "true" | Copy says "best available estimate, and here's the uncertainty" — the confidence layer turns our honesty into the feature |
| GDPR / cookie consent | 1st-party cookie, hashed IPs, no raw PII in `Touch`, consent-mode flag, DPA-ready |
| AI hallucinating metrics | Model only ever receives precomputed numbers; impact figures are arithmetic in code |
| Scope creep killing the 90-day clock | Phase 1 ships alone and is independently sellable; nothing in Phase 3+ blocks revenue |
| Hot-path write volume | `/api/t/collect` on edge runtime, narrow indexes, aggregate rollups for dashboards |

---

## First commit targets

`prisma/schema.prisma` · `lib/attribution/models.ts` + its test ·
`lib/stats/confidence.ts` + its test · `public/t.js` ·
`app/api/t/collect/route.ts` · `app/api/v1/conversions/route.ts` ·
`scripts/seed-demo.ts` · `lib/adapters/types.ts`

All work on `claude/laughing-pasteur-jztz4t`.
