import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { PhasePlaceholder } from "@/components/app-shell/phase-placeholder";
import { CacCell } from "@/components/reporting/cac-cell";
import { FilterBar } from "@/components/reporting/filter-bar";
import { SearchBox } from "@/components/reporting/search-box";
import { Badge } from "@/components/ui/badge";
import { formatCents, formatCount } from "@/lib/format";
import { getAdPerformance } from "@/lib/reporting/queries";
import { resolveModel, resolveRange, MODEL_LABELS } from "@/lib/reporting/range";
import { requireWorkspaceAccess } from "@/lib/workspace";
import type { Platform } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Ads" };

const PLATFORMS: Array<Platform | "ALL"> = ["ALL", "META", "GOOGLE", "TIKTOK", "LINKEDIN"];

export default async function AdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{
    range?: string;
    model?: string;
    search?: string;
    platform?: string;
  }>;
}) {
  const { workspace: slug } = await params;
  const sp = await searchParams;
  const { workspace } = await requireWorkspaceAccess(slug);

  const range = resolveRange(sp.range);
  const model = resolveModel(sp.model);
  const currency = workspace.currency;
  const platform = (PLATFORMS as string[]).includes(sp.platform ?? "")
    ? (sp.platform as Platform | "ALL")
    : "ALL";

  const ads = await getAdPerformance(workspace.id, {
    range,
    model,
    search: sp.search?.trim() || undefined,
    platform,
    targetCacCents: workspace.targetCacCents,
  });

  const totals = ads.reduce(
    (acc, ad) => ({
      spendCents: acc.spendCents + ad.spendCents,
      acquisitions: acc.acquisitions + ad.acquisitions,
      newMrrCents: acc.newMrrCents + ad.newMrrCents,
    }),
    { spendCents: 0, acquisitions: 0, newMrrCents: 0 },
  );

  return (
    <>
      <PageHeader
        title="Ads"
        description={`Cost against what it produced, credited by ${MODEL_LABELS[model].toLowerCase()}.`}
      />

      <PageBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <FilterBar
            basePath={`/app/${slug}/ads`}
            params={{ range: range.key, model, search: sp.search, platform }}
            range={range.key}
            model={model}
          />
          <SearchBox
            basePath={`/app/${slug}/ads`}
            params={{ range: range.key, model, platform }}
            defaultValue={sp.search ?? ""}
            placeholder="Search ads and campaigns"
          />
        </div>

        {!workspace.targetCacCents ? (
          <p className="rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
            No target CAC set, so there are no scale-or-cut verdicts. Set one in Settings →
            Tracking.
          </p>
        ) : null}

        {ads.length === 0 ? (
          <PhasePlaceholder
            icon="ads"
            title="No ads with activity in this period"
            description={
              sp.search
                ? "Nothing matched that search. Try a shorter term or a wider date range."
                : "Import spend, or widen the date range, to see ad performance here."
            }
            willShow={[
              "CAC per ad with a 95% credible interval and a verdict",
              "Search, date range, platform and campaign filters",
              "Credited revenue under each of the five attribution models",
            ]}
          />
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
            <table className="w-full min-w-[56rem] border-collapse text-sm">
              <caption className="sr-only">
                Ad performance for {range.days} days, credited by {MODEL_LABELS[model]}
              </caption>
              <thead>
                <tr className="border-b border-[var(--border)] bg-bg-subtle text-left">
                  <Th className="min-w-64">Ad</Th>
                  <Th align="right">Spend</Th>
                  <Th align="right">Clicks</Th>
                  <Th align="right">Conversions</Th>
                  <Th className="min-w-52">CAC</Th>
                  <Th align="right">New MRR</Th>
                </tr>
              </thead>
              <tbody>
                {ads.map((ad) => (
                  <tr
                    key={ad.adId}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-bg-subtle"
                  >
                    <Td>
                      <p className="font-medium text-fg">{ad.adName}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
                        <Badge>{ad.platform}</Badge>
                        <span className="truncate">{ad.campaignName}</span>
                        {ad.angleName ? (
                          <span className="text-fg-subtle">· {ad.angleName}</span>
                        ) : null}
                      </p>
                    </Td>
                    <Td align="right" mono>
                      {formatCents(ad.spendCents, { currency })}
                    </Td>
                    <Td align="right" mono>
                      {formatCount(ad.clicks)}
                    </Td>
                    <Td align="right" mono>
                      {ad.acquisitions % 1 === 0
                        ? formatCount(ad.acquisitions)
                        : ad.acquisitions.toFixed(1)}
                    </Td>
                    <Td>
                      <CacCell estimate={ad.cac} currency={currency} />
                    </Td>
                    <Td align="right" mono>
                      {formatCents(ad.newMrrCents, { currency })}
                    </Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border-strong)] bg-bg-subtle font-medium">
                  <Td>{ads.length} ads</Td>
                  <Td align="right" mono>
                    {formatCents(totals.spendCents, { currency })}
                  </Td>
                  <Td />
                  <Td align="right" mono>
                    {formatCount(Math.round(totals.acquisitions))}
                  </Td>
                  <Td align="right" mono>
                    {totals.acquisitions > 0
                      ? `${formatCents(Math.round(totals.spendCents / totals.acquisitions), { currency })} blended`
                      : "—"}
                  </Td>
                  <Td align="right" mono>
                    {formatCents(totals.newMrrCents, { currency })}
                  </Td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </PageBody>
    </>
  );
}

function Th({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle ${
        align === "right" ? "text-right" : "text-left"
      } ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  mono = false,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
}) {
  return (
    <td
      className={`px-3 py-3 align-top text-fg ${align === "right" ? "text-right" : ""} ${
        mono ? "tabular" : ""
      }`}
    >
      {children}
    </td>
  );
}
