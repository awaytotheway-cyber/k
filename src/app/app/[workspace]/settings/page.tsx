import type { Metadata } from "next";
import Link from "next/link";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { env, features } from "@/lib/env";
import { requireWorkspaceAccess } from "@/lib/workspace";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace, org, role } = await requireWorkspaceAccess(slug);

  const snippet = `<script async src="${env.NEXT_PUBLIC_APP_URL}/t.js" data-key="${workspace.pixelKey}"></script>`;

  return (
    <>
      <PageHeader title="Settings" description="Workspace, tracking and billing." />

      <PageBody className="max-w-3xl space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <Row label="Name" value={workspace.name} />
            <Row label="URL slug" value={workspace.slug} mono />
            <Row label="Currency" value={workspace.currency} />
            <Row label="Timezone" value={workspace.timezone} />
            <Row
              label="Attribution lookback"
              value={`${workspace.lookbackDays} days`}
            />
            <Row
              label="Target CAC"
              value={
                workspace.targetCacCents
                  ? `$${(workspace.targetCacCents / 100).toFixed(2)}`
                  : "Not set — needed for scale/cut verdicts"
              }
            />
            <Row label="Your role" value={role} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tracking snippet</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-fg-muted">
              Paste into the <code className="font-mono text-xs text-fg">&lt;head&gt;</code> of
              every page. The key below is public by design — it only identifies which workspace
              an event belongs to.
            </p>
            <CodeBlock code={snippet} language="html" className="mt-3" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <Row
              label="Current plan"
              value={
                <span className="inline-flex items-center gap-2">
                  {org.plan}
                  <Badge tone={org.planStatus === "TRIALING" ? "primary" : "neutral"}>
                    {org.planStatus.toLowerCase().replace("_", " ")}
                  </Badge>
                </span>
              }
            />
            {org.trialEndsAt ? (
              <Row
                label="Trial ends"
                value={org.trialEndsAt.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              />
            ) : null}
            {!features.billing ? (
              <p className="rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
                Stripe is not configured on this install, so upgrades are unavailable. Add
                STRIPE_SECRET_KEY to enable checkout.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coming in later phases</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2 text-sm text-fg-muted">
              {[
                ["Tracking & API keys", `/app/${slug}/settings/tracking`],
                ["Conversion sources (Stripe, CRM)", `/app/${slug}/settings/conversions`],
                ["Ad accounts & spend import", `/app/${slug}/settings/ad-accounts`],
                ["Team & roles", `/app/${slug}/settings/team`],
                ["Billing", `/app/${slug}/settings/billing`],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-primary hover:underline">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-fg-muted">{label}</span>
      <span className={`text-sm text-fg ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
