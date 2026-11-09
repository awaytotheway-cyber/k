import type { Metadata } from "next";

import { OnboardingChecklist } from "@/app/app/[workspace]/onboarding-checklist";
import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { daysUntil } from "@/lib/dates";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireWorkspaceAccess } from "@/lib/workspace";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace, org } = await requireWorkspaceAccess(slug);

  // Which onboarding steps are already done. Cheap existence checks, not counts.
  const [touchCount, conversionCount, spendRow, apiKeyCount] = await Promise.all([
    db.touch.count({ where: { workspaceId: workspace.id } }),
    db.conversion.count({ where: { workspaceId: workspace.id } }),
    db.spendDaily.findFirst({
      where: { workspaceId: workspace.id },
      select: { id: true },
    }),
    db.apiKey.count({ where: { workspaceId: workspace.id, revokedAt: null } }),
  ]);

  const hasEverything = touchCount > 0 && conversionCount > 0 && spendRow !== null;

  const trialDaysLeft = daysUntil(org.trialEndsAt);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          hasEverything
            ? "True cost per acquisition and ROAS, by ad."
            : "Three steps and your real numbers appear here."
        }
        actions={
          org.planStatus === "TRIALING" && trialDaysLeft !== null ? (
            <Badge tone={trialDaysLeft <= 3 ? "warning" : "neutral"}>
              {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"} left in trial
            </Badge>
          ) : null
        }
      />

      <PageBody className="space-y-6">
        {hasEverything ? (
          // Phase 1 replaces this with the metric tiles, trend chart, and the
          // top/bottom ads table. Everything it needs is already flowing in.
          <Card>
            <CardBody>
              <CardTitle>Tracking is live</CardTitle>
              <p className="mt-1.5 text-sm text-fg-muted">
                {touchCount.toLocaleString()} visits and {conversionCount.toLocaleString()}{" "}
                conversions recorded, with spend imported. Attributed CAC and ROAS tiles land
                in the next phase.
              </p>
            </CardBody>
          </Card>
        ) : (
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
        )}
      </PageBody>
    </>
  );
}
