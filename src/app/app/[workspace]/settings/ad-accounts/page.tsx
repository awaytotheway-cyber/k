import type { Metadata } from "next";

import { ImportSpendForm } from "@/app/app/[workspace]/settings/ad-accounts/import-form";
import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatCents, formatCount } from "@/lib/format";
import { requireWorkspaceAccess } from "@/lib/workspace";

export const metadata: Metadata = { title: "Ad accounts & spend" };

export default async function AdAccountsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace } = await requireWorkspaceAccess(slug);

  const [accounts, spendTotal, imports] = await Promise.all([
    db.adAccount.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        platform: true,
        name: true,
        source: true,
        connectionStatus: true,
        lastSyncedAt: true,
        _count: { select: { campaigns: true } },
      },
    }),
    db.spendDaily.aggregate({
      where: { workspaceId: workspace.id },
      _sum: { spendCents: true },
      _count: true,
    }),
    db.importBatch.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        filename: true,
        rowCount: true,
        importedCount: true,
        skippedCount: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Ad accounts & spend"
        description="The cost side: what you spent, by ad."
      />

      <PageBody className="max-w-3xl space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Import spend</CardTitle>
            <CardDescription>
              Direct Meta and Google sync arrives once app review clears. Nothing imported now
              is wasted — both read into the same tables.
            </CardDescription>
          </CardHeader>
          <CardBody>
            <ImportSpendForm workspaceSlug={workspace.slug} />
            <p className="mt-4 text-xs text-fg-subtle">
              Need the shape?{" "}
              <a
                href={`/app/${workspace.slug}/settings/ad-accounts/sample.csv`}
                className="text-primary hover:underline"
                download
              >
                Download a sample CSV
              </a>
              . Required columns: date, campaign, and spend. Ad set, ad, impressions and clicks
              are used when present.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connected sources</CardTitle>
          </CardHeader>
          <CardBody>
            {accounts.length === 0 ? (
              <p className="text-sm text-fg-muted">
                No spend sources yet. Import a CSV above to create one.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {accounts.map((account) => (
                  <li key={account.id} className="flex flex-wrap items-center gap-2 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium text-fg">
                        {account.name}
                        <Badge tone={account.source === "API" ? "success" : "neutral"}>
                          {account.source}
                        </Badge>
                      </p>
                      <p className="mt-0.5 text-xs text-fg-subtle">
                        {account._count.campaigns} campaigns
                        {account.lastSyncedAt
                          ? ` · updated ${account.lastSyncedAt.toLocaleDateString("en-US")}`
                          : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 tabular text-sm text-fg-muted">
              {formatCount(spendTotal._count)} spend rows ·{" "}
              {formatCents(spendTotal._sum.spendCents ?? 0, { currency: workspace.currency })}{" "}
              total
            </p>
          </CardBody>
        </Card>

        {imports.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Recent imports</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="divide-y divide-[var(--border)]">
                {imports.map((batch) => (
                  <li key={batch.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg">{batch.filename}</p>
                      <p className="text-xs text-fg-subtle">
                        {batch.createdAt.toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <p className="tabular text-xs text-fg-muted">
                      {formatCount(batch.importedCount)} imported
                      {batch.skippedCount > 0 ? (
                        <span className="text-warning"> · {batch.skippedCount} skipped</span>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
      </PageBody>
    </>
  );
}
