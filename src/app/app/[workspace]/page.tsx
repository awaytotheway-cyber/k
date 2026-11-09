import type { Metadata } from "next";
import Link from "next/link";

import { OnboardingChecklist } from "@/app/app/[workspace]/onboarding-checklist";
import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { CacCell } from "@/components/reporting/cac-cell";
import { FilterBar } from "@/components/reporting/filter-bar";
import { MetricTile } from "@/components/reporting/metric-tile";
import { TrendChart } from "@/components/reporting/trend-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { daysUntil } from "@/lib/dates";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatCents, formatCount } from "@/lib/format";
import { getAdPerformance, getSummary, getTrend } from "@/lib/reporting/queries";
import { percentChange, previousRange, resolveModel, resolveRange } from "@/lib/reporting/range";
import { requireWorkspaceAccess } from "@/lib/workspace";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ range?: string; model?: string }>;
}) {
  const { workspace: slug } = await params;
  const search = await searchParams;
  const { workspace, org } = await requireWorkspaceAccess(slug);

  const range = resolveRange(search.range);
  const model = resolveModel(search.model);
  const currency = workspace.currency;

  const [touchCount, conversionCount, spendRow, apiKeyCount] = await Promise.all([
    db.touch.count({ where: { workspaceId: workspace.id } }),
    db.conversion.count({ where: { workspaceId: workspace.id } }),
    db.spendDaily.findFirst({ where: { workspaceId: workspace.id }, select: { id: true } }),
    db.apiKey.count({ where: { workspaceId: workspace.id, revokedAt: null } }),
  ]);

  const ready = touchCount > 0 && conversionCount > 0 && spendRow !== null;
  const trialDaysLeft = daysUntil(org.trialEndsAt);

  if (!ready) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description="Three steps and your real numbers appear here."
          actions={<TrialBadge days={trialDaysLeft} status={org.planStatus} />}
        />
        <PageBody>
          <OnboardingChecklist
            appUrl={env.NEXT_PUBLIC_APP_URL}
            pixelKey={workspace.pixelKey}
            workspaceSlug={workspace.slug}
            state={{
              hasTouches: touchCount > 0,
              hasConversions: conversionCount > 0,
              hasSpend: spendRow !== null,
              hasApiKey: apiKeyCount > 0,
            }}
          />
        </PageBody>
      </>
    );
  }

  const prior = previousRange(range);

  const [summary, priorSummary, trend, ads] = await Promise.all([
    getSummary(workspace.id, range, model),
    getSummary(workspace.id, prior, model),
    getTrend(workspace.id, range, model),
    getAdPerformance(workspace.id, {
      range,
      model,
      targetCacCents: workspace.targetCacCents,
    }),
  ]);

  // Only ads with enough evidence to be worth ranking. An ad with two
  // conversions is not the "worst performer", it is an untested one.
  const judged = ads.filter((a) => a.cac.verdict === "LIKELY_GOOD" || a.cac.verdict === "LIKELY_BAD");
  const best = judged.filter((a) => a.cac.verdict === "LIKELY_GOOD").slice(0, 3);
  const worst = [...judged]
    .filter((a) => a.cac.verdict === "LIKELY_BAD")
    .sort((a, b) => b.spendCents - a.spendCents)
    .slice(0, 3);
  const tooEarly = ads.filter((a) => a.cac.verdict === "TOO_EARLY" && a.spendCents > 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`True cost per acquisition and new MRR, by ad.`}
        actions={<TrialBadge days={trialDaysLeft} status={org.planStatus} />}
      />

      <PageBody className="space-y-6">
        <FilterBar
          basePath={`/app/${slug}`}
          params={{ range: range.key, model }}
          range={range.key}
          model={model}
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Ad spend"
            value={formatCents(summary.spendCents, { currency })}
            deltaPercent={percentChange(summary.spendCents, priorSummary.spendCents)}
            hint={`${formatCount(summary.clicks)} clicks`}
          />
          <MetricTile
            label="Acquisitions"
            value={formatCount(Math.round(summary.acquisitions))}
            deltaPercent={percentChange(summary.acquisitions, priorSummary.acquisitions)}
            hint="trials, demos, signups"
          />
          <MetricTile
            label="Blended CAC"
            value={formatCents(summary.cacCents, { currency })}
            deltaPercent={percentChange(summary.cacCents ?? 0, priorSummary.cacCents ?? 0)}
            lowerIsBetter
            hint={
              workspace.targetCacCents
                ? `target ${formatCents(workspace.targetCacCents, { currency })}`
                : "no target set"
            }
          />
          <MetricTile
            label="New MRR"
            value={formatCents(summary.newMrrCents, { currency })}
            deltaPercent={percentChange(summary.newMrrCents, priorSummary.newMrrCents)}
            hint={
              summary.paybackMonths !== null
                ? `${summary.paybackMonths.toFixed(1)} mo payback`
                : undefined
            }
          />
        </div>

        <Card>
          <CardBody>
            <TrendChart data={trend} currency={currency} />
          </CardBody>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <AdList
            title="Working"
            caption="Whole credible interval below your target."
            tone="success"
            ads={best}
            currency={currency}
            slug={slug}
            emptyText="Nothing has cleared the bar with enough data yet."
          />
          <AdList
            title="Costing you money"
            caption="Whole credible interval above your target."
            tone="danger"
            ads={worst}
            currency={currency}
            slug={slug}
            emptyText="No ad is confidently losing money. "
          />
        </div>

        {tooEarly.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Too early to judge — {tooEarly.length} ads</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-fg-muted">
                These are spending but have not produced enough conversions for the number to
                mean anything yet. Killing them now is a coin flip.
              </p>
              <ul className="mt-3 space-y-2">
                {tooEarly.slice(0, 5).map((ad) => (
                  <li key={ad.adId} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm text-fg">{ad.adName}</span>
                    <span className="tabular shrink-0 text-xs text-fg-subtle">
                      {formatCents(ad.spendCents, { currency })} spent ·{" "}
                      {ad.cac.conversionsNeeded !== null
                        ? `~${ad.cac.conversionsNeeded} more needed`
                        : `n=${ad.cac.conversions}`}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/app/${slug}/ads?range=${range.key}&model=${model}`}>
                    See all ads
                  </Link>
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : null}

        {summary.unattributedConversions > 0 ? (
          <p className="text-xs text-fg-subtle">
            {formatCount(summary.unattributedConversions)} conversions in this period had no paid
            click behind them — organic, direct, or tracked before the pixel was installed. They
            count toward revenue but not toward any ad.
          </p>
        ) : null}
      </PageBody>
    </>
  );
}

function TrialBadge({ days, status }: { days: number | null; status: string }) {
  if (status !== "TRIALING" || days === null) return null;
  return (
    <Badge tone={days <= 3 ? "warning" : "neutral"}>
      {days} {days === 1 ? "day" : "days"} left in trial
    </Badge>
  );
}

function AdList({
  title,
  caption,
  tone,
  ads,
  currency,
  slug,
  emptyText,
}: {
  title: string;
  caption: string;
  tone: "success" | "danger";
  ads: Awaited<ReturnType<typeof getAdPerformance>>;
  currency: string;
  slug: string;
  emptyText: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className={tone === "success" ? "text-success" : "text-danger"}>{title}</span>
        </CardTitle>
        <p className="mt-0.5 text-xs text-fg-subtle">{caption}</p>
      </CardHeader>
      <CardBody>
        {ads.length === 0 ? (
          <p className="text-sm text-fg-muted">{emptyText}</p>
        ) : (
          <ul className="space-y-3">
            {ads.map((ad) => (
              <li key={ad.adId} className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/app/${slug}/ads?search=${encodeURIComponent(ad.adName)}`}
                    className="block truncate text-sm text-fg hover:underline"
                  >
                    {ad.adName}
                  </Link>
                  <p className="tabular text-xs text-fg-subtle">
                    {formatCents(ad.spendCents, { currency })} spent ·{" "}
                    {formatCents(ad.newMrrCents, { currency })} MRR
                  </p>
                </div>
                <CacCell estimate={ad.cac} currency={currency} compact />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
