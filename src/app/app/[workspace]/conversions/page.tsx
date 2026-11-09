import type { Metadata } from "next";
import Link from "next/link";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { PhasePlaceholder } from "@/components/app-shell/phase-placeholder";
import { FilterBar } from "@/components/reporting/filter-bar";
import { SearchBox } from "@/components/reporting/search-box";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatCents, formatCount } from "@/lib/format";
import { getConversions, getTouchPaths, type PathTouch } from "@/lib/reporting/queries";
import { MODEL_LABELS, resolveModel, resolveRange } from "@/lib/reporting/range";
import { requireWorkspaceAccess } from "@/lib/workspace";

export const metadata: Metadata = { title: "Conversions" };

const PAGE_SIZE = 50;

const EVENT_TYPES = [
  "ALL",
  "TRIAL",
  "DEMO",
  "SIGNUP",
  "QUALIFIED",
  "SUBSCRIPTION",
  "PURCHASE",
] as const;

export default async function ConversionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{
    range?: string;
    model?: string;
    search?: string;
    eventType?: string;
    page?: string;
  }>;
}) {
  const { workspace: slug } = await params;
  const sp = await searchParams;
  const { workspace } = await requireWorkspaceAccess(slug);

  const range = resolveRange(sp.range);
  const model = resolveModel(sp.model);
  const currency = workspace.currency;
  const page = Math.max(1, Number(sp.page) || 1);
  const eventType = (EVENT_TYPES as readonly string[]).includes(sp.eventType ?? "")
    ? (sp.eventType as (typeof EVENT_TYPES)[number])
    : "ALL";

  const { rows, total } = await getConversions(workspace.id, {
    range,
    model,
    search: sp.search?.trim() || undefined,
    eventType: eventType === "ALL" ? "ALL" : eventType,
    page,
    pageSize: PAGE_SIZE,
  });

  const paths = await getTouchPaths(
    workspace.id,
    rows.map((r) => r.id),
    workspace.lookbackDays,
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseParams = {
    range: range.key,
    model,
    search: sp.search,
    eventType: eventType === "ALL" ? undefined : eventType,
  };

  function pageHref(target: number) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(baseParams)) if (v) q.set(k, v);
    if (target > 1) q.set("page", String(target));
    const s = q.toString();
    return `/app/${slug}/conversions${s ? `?${s}` : ""}`;
  }

  return (
    <>
      <PageHeader
        title="Conversions"
        description="Every signup, trial and payment, and the ads behind it."
      />

      <PageBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <FilterBar
            basePath={`/app/${slug}/conversions`}
            params={{ ...baseParams, page: undefined }}
            range={range.key}
            model={model}
          />
          <SearchBox
            basePath={`/app/${slug}/conversions`}
            params={{ range: range.key, model, eventType: baseParams.eventType }}
            defaultValue={sp.search ?? ""}
            placeholder="Search email or event"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {EVENT_TYPES.map((type) => {
            const q = new URLSearchParams();
            for (const [k, v] of Object.entries({ ...baseParams, eventType: undefined })) {
              if (v) q.set(k, v);
            }
            if (type !== "ALL") q.set("eventType", type);
            const href = `/app/${slug}/conversions${q.toString() ? `?${q}` : ""}`;
            return (
              <Link
                key={type}
                href={href}
                aria-current={type === eventType ? "true" : undefined}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  type === eventType
                    ? "border-transparent bg-primary text-primary-fg"
                    : "border-[var(--border)] text-fg-muted hover:bg-bg-subtle hover:text-fg",
                )}
              >
                {type === "ALL" ? "All types" : type.toLowerCase()}
              </Link>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <PhasePlaceholder
            icon="conversions"
            title="No conversions in this view"
            description={
              sp.search || eventType !== "ALL"
                ? "Nothing matched those filters. Try clearing them or widening the date range."
                : "Send conversions from Stripe or the API and they appear here within seconds."
            }
            willShow={[
              "One row per conversion with its value, MRR and source",
              "Expand any row to see every ad that customer saw first",
              "Filter by type, date range and attributed platform",
            ]}
          />
        ) : (
          <>
            <p className="text-sm text-fg-muted">
              {formatCount(total)} conversions · credited by {MODEL_LABELS[model].toLowerCase()}
            </p>

            <ul className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
              {rows.map((row) => {
                const path = paths.get(row.id) ?? [];
                return (
                  <li key={row.id} className="border-b border-[var(--border)] last:border-0">
                    <details className="group">
                      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-3 hover:bg-bg-subtle">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          className="size-3.5 shrink-0 text-fg-subtle transition-transform group-open:rotate-90"
                          aria-hidden="true"
                        >
                          <path d="m9 6 6 6-6 6" />
                        </svg>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-fg">
                            {row.email ?? <span className="text-fg-subtle">anonymous</span>}
                          </p>
                          <p className="truncate text-xs text-fg-subtle">
                            {row.eventName} ·{" "}
                            {row.occurredAt.toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>

                        <Badge>{row.eventType.toLowerCase()}</Badge>

                        <div className="w-28 shrink-0 text-right">
                          {row.mrrCents ? (
                            <p className="tabular text-sm font-medium text-fg">
                              {formatCents(row.mrrCents, { currency })}
                              <span className="text-xs font-normal text-fg-subtle"> MRR</span>
                            </p>
                          ) : (
                            <p className="text-xs text-fg-subtle">no revenue</p>
                          )}
                        </div>

                        <div className="w-44 shrink-0 truncate text-right text-xs">
                          {row.creditedAdName ? (
                            <span className="text-fg-muted">{row.creditedAdName}</span>
                          ) : (
                            <span className="text-fg-subtle">unattributed</span>
                          )}
                        </div>
                      </summary>

                      <TouchPath path={path} />
                    </details>
                  </li>
                );
              })}
            </ul>

            {totalPages > 1 ? (
              <nav className="flex items-center justify-between" aria-label="Pagination">
                <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
                  Previous
                </PageLink>
                <span className="text-sm text-fg-muted">
                  Page {page} of {totalPages}
                </span>
                <PageLink href={pageHref(page + 1)} disabled={page >= totalPages}>
                  Next
                </PageLink>
              </nav>
            ) : null}
          </>
        )}
      </PageBody>
    </>
  );
}

/**
 * The click path behind one conversion.
 *
 * This is the answer to "why does it say that ad?" — every touch we recorded,
 * in order, including the organic and direct ones that received no credit.
 * Showing the uncredited visits is the point: it is what makes the credited
 * one checkable rather than something to take on faith.
 */
function TouchPath({ path }: { path: PathTouch[] }) {
  if (path.length === 0) {
    return (
      <div className="border-t border-[var(--border)] bg-bg-subtle px-3 py-3 pl-9">
        <p className="text-sm text-fg-muted">
          No visits recorded for this person inside the lookback window. The conversion counts
          toward revenue but cannot be credited to an ad.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--border)] bg-bg-subtle px-3 py-3 pl-9">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
        {path.length} {path.length === 1 ? "visit" : "visits"} before converting
      </p>
      <ol className="space-y-2">
        {path.map((touch, index) => {
          const paid = touch.clickIdType !== "NONE" || isAdPlatform(touch.platform);
          return (
            <li key={touch.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
              <span className="tabular w-5 shrink-0 text-fg-subtle">{index + 1}.</span>
              <Badge tone={paid ? "primary" : "neutral"}>{touch.platform}</Badge>
              <span className="text-fg">{touch.adName ?? touch.campaignName ?? "—"}</span>
              <span className="text-fg-subtle">
                {touch.occurredAt.toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              {!paid ? <span className="text-fg-subtle">· no credit</span> : null}
              <span className="w-full truncate pl-7 text-fg-subtle">{touch.landingUrl}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function isAdPlatform(platform: string): boolean {
  return ["META", "GOOGLE", "TIKTOK", "LINKEDIN", "MICROSOFT"].includes(platform);
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-sm text-fg-subtle">{children}</span>;
  }
  return (
    <Link href={href} className="text-sm font-medium text-primary hover:underline">
      {children}
    </Link>
  );
}
