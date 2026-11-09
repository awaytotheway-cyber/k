# TrueROAS

Marketing attribution and AI analytics for B2B SaaS advertisers.

Tie every trial and every dollar of MRR back to the exact ad that produced it —
then find out whether there is enough data to act on it yet.

> **Status: Phase 0 complete.** The foundation runs: auth, tenancy, the full
> database schema, the app shell, and a 90-day demo dataset. The attribution
> engine, pixel, and ingest APIs land in Phase 1. See
> [`docs/specs/2026-11-09-trueroas-design.md`](docs/specs/2026-11-09-trueroas-design.md)
> for the full plan and what each phase delivers.

---

## What it does

```
Ad click            → lands with ?fbclid=…&utm_campaign=…
  ↓  t.js pixel (first-party, your own domain)
Touch recorded      → visitor cookie + click id + UTMs
  ↓  visitor signs up, then pays
Conversion ingested → Stripe webhook / POST /api/v1/conversions
  ↓  attribution engine (90-day lookback, five models at once)
Attributed revenue  → per ad → ad set → campaign
  ↓  + imported spend
True CAC and ROAS   → with a credible interval, not a false precision
  ↓
Daily Action Brief  → ranked scale / cut / watch, with projected $ impact
```

The part most tools skip: **you do not need platform API access to start.**
Click ids arrive in the landing URL for free and Stripe knows your revenue, so
attribution works on day one with spend imported from a CSV. Direct Meta and
Google sync drops in behind an adapter interface once app review clears.

---

## Requirements

| | |
|---|---|
| Node | 22 or newer |
| PostgreSQL | 14 or newer (16 recommended) |
| npm | 10 or newer |

---

## Local setup

**1. Install dependencies**

```bash
npm install
```

**2. Start PostgreSQL and create the database**

```bash
createdb trueroas
```

On a Debian/Ubuntu host where the server is not running yet:

```bash
sudo pg_ctlcluster 16 main start && sudo -u postgres createdb trueroas
```

**3. Configure the environment**

```bash
cp .env.example .env
```

Then set at minimum `DATABASE_URL` and `AUTH_SECRET` in `.env`:

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -hex 32      # IP_HASH_SALT and CRON_SECRET
```

**4. Create the schema**

```bash
npm run db:migrate
```

**5. Load the demo workspace (recommended)**

```bash
npm run seed:demo
```

This generates 90 days of realistic history — 12 ads, ~$83k of spend, ~24k
visitors, ~1,300 conversions — and prints a demo login. It doubles as the sales
demo: a prospect can see a populated product before installing anything.

To attach the demo workspace to an account you already created instead:

```bash
npm run seed:demo -- --email you@company.com
```

**6. Run it**

```bash
npm run dev
```

Open <http://localhost:3000>. Use the URL that matches `AUTH_URL` — a session
cookie set on `localhost` is not sent to `127.0.0.1`, so mixing the two will
appear to log you straight back out.

---

## Environment variables

Only the first two are required to boot. The app reports missing optional
integrations in the UI rather than crashing, so you can run it before Stripe or
Anthropic are set up.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **yes** | Postgres connection string. Use the pooled URL in production. |
| `AUTH_SECRET` | **yes** | Signs session JWTs. `openssl rand -base64 32`. |
| `AUTH_URL` | — | App origin used for auth callbacks. Must match the host users visit. |
| `NEXT_PUBLIC_APP_URL` | — | Origin embedded in the tracking snippet and share links. |
| `IP_HASH_SALT` | — | Salts visitor IP hashes. Raw IPs are never stored; rotating this deliberately breaks the link between old and new hashes. |
| `DATABASE_POOL_MAX` | — | Connections per process (default 5). Keep low on serverless. |
| `ANTHROPIC_API_KEY` | — | Daily brief, chat, angle tagging. |
| `AI_MODEL_BRIEF` / `AI_MODEL_CHAT` | — | Model ids. Brief uses the stronger model; it runs once a day. |
| `STRIPE_SECRET_KEY` | — | Our own billing. |
| `STRIPE_WEBHOOK_SECRET` | — | Verifies inbound Stripe billing webhooks. |
| `STRIPE_PRICE_*` | — | Price ids for the three tiers, monthly and annual. |
| `RESEND_API_KEY` | — | Transactional email. Unset logs emails to the console. |
| `CRON_SECRET` | — | Shared secret so only the scheduler can call `/api/cron/*`. |
| `META_*`, `GOOGLE_ADS_*` | — | Phase 3 platform sync. Leave blank until app review clears. |

---

## Scripts

```bash
npm run dev          # dev server
npm run build        # prisma generate + production build
npm start            # serve the production build

npm test             # unit tests (Vitest)
npm run test:watch
npm run typecheck    # tsc --noEmit
npm run lint
npm run format

npm run db:migrate   # create and apply a migration
npm run db:deploy    # apply migrations (production)
npm run db:studio    # browse the data
npm run db:reset     # drop and rebuild — destroys all local data
npm run seed:demo    # (re)build the demo workspace
```

---

## Architecture

```
src/
  app/
    (auth)/              login, signup
    app/[workspace]/     the authenticated shell and its pages
    api/auth/            Auth.js route handler
  components/
    app-shell/           sidebar, workspace switcher, page chrome
    ui/                  button, card, input, badge, empty state, code block
  lib/
    auth.ts              Auth.js config (credentials + JWT sessions)
    workspace.ts         requireUser / requireWorkspaceAccess — the tenancy guard
    db.ts                Prisma singleton with the node-postgres adapter
    env.ts               validated environment, plus a `features` map
    theme.ts             theme cookie helpers
  generated/prisma/      generated client — not in version control
prisma/schema.prisma     27 models, one migration
scripts/seed-demo.ts     the demo dataset
docs/specs/              the design spec this is built from
```

**Tenancy.** `Organization` → `Workspace` from the first migration: one
workspace for a solo SaaS, many for an agency, no rewrite in between. Access is
always proven by a database join (workspace → org → membership → user), never by
trusting a slug in the URL. A workspace you cannot see returns 404 rather than
403, so the response does not confirm it exists.

**Attribution storage.** `Attribution` rows are precomputed per model, with the
conversion's timestamp and the ad hierarchy denormalized onto them, so every
dashboard query is a flat aggregate rather than a graph walk. Credited cents
across a (conversion, model) group sum exactly to the conversion value.

**Theme.** The light/dark class is rendered by the server from a cookie, so
there is no inline script and no flash of the wrong theme — including on error
and not-found boundaries, where a `beforeInteractive` script does not reliably
run. With no cookie, CSS follows the operating system.

---

## Notable version choices

- **Next.js 16** — the version `create-next-app` scaffolds (15.5.4) carries a
  critical RCE advisory; the remaining transitive advisories only clear on 16.
- **Prisma 7.10.1, pinned** — `npm i prisma` currently resolves to an 8.0
  release candidate. Prisma 7 also dropped the bundled query engine, so the
  client is constructed with the explicit `@prisma/adapter-pg` driver adapter.
- **Auth.js v5 (beta)** — the supported path for the App Router. Credentials
  sign-in requires JWT sessions; the `Account`/`Session` tables exist so adding
  Google or Microsoft sign-in later is config, not a migration.

`npm audit` reports a few **moderate, dev-only** advisories inside
`eslint-config-next`'s pinned `typescript-eslint`. npm's suggested "fix" is to
downgrade to Next 15, which reintroduces the critical one. No runtime
dependency has an open advisory.

---

## Testing

```bash
npm test
```

Unit tests cover the pure logic. As Phase 1 lands, the attribution models
(credit fractions summing to 1.0 across every path shape) and the confidence
interval maths are the highest-value tests in the codebase and are written
test-first.

The core-loop end-to-end guard — simulated click carrying `fbclid` → conversion
via the API → attributed to the right ad on the dashboard — arrives with Phase 1
alongside the code it protects.

---

## Deploying

**Vercel + Neon** is the intended target.

1. Create a Neon Postgres database and copy the **pooled** connection string.
2. Import the repository into Vercel.
3. Set the environment variables above in the Vercel project. `AUTH_URL` and
   `NEXT_PUBLIC_APP_URL` must be your real origin, not `localhost`.
4. Deploy. `npm run build` runs `prisma generate` automatically.
5. Apply migrations against production:

```bash
DATABASE_URL="<neon-direct-url>" npm run db:deploy
```

6. Point your Stripe webhook at `https://your-domain/api/webhooks/stripe-billing`
   and put the signing secret in `STRIPE_WEBHOOK_SECRET`.

**Use a custom domain.** The tracking snippet must be served from the same
domain as the site it measures — that is what makes the cookie first-party and
keeps it alive under Safari's tracking prevention and most ad blockers.

Go to Stripe live keys only after a full test-mode checkout has passed end to
end.

---

## Licence

Private and unlicensed.
