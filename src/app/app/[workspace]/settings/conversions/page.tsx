import type { Metadata } from "next";

import { StripeSecretForm } from "@/app/app/[workspace]/settings/conversions/stripe-form";
import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { disconnectStripeAction } from "@/lib/actions/stripe-actions";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatCount } from "@/lib/format";
import { requireWorkspaceAccess } from "@/lib/workspace";

export const metadata: Metadata = { title: "Conversion sources" };

export default async function ConversionSettingsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace } = await requireWorkspaceAccess(slug);

  const [row, bySource] = await Promise.all([
    db.workspace.findUnique({
      where: { id: workspace.id },
      select: { stripeWebhookSecret: true },
    }),
    db.conversion.groupBy({
      by: ["source"],
      where: { workspaceId: workspace.id },
      _count: true,
    }),
  ]);

  const configured = Boolean(row?.stripeWebhookSecret);
  const webhookUrl = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/stripe/${workspace.id}`;
  const stripeCount = bySource.find((s) => s.source === "STRIPE")?._count ?? 0;

  return (
    <>
      <PageHeader
        title="Conversion sources"
        description="Where your revenue comes from."
      />

      <PageBody className="max-w-3xl space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Stripe
              {configured ? (
                <Badge tone={stripeCount > 0 ? "success" : "primary"}>
                  {stripeCount > 0 ? "Receiving" : "Waiting for events"}
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription>
              The fastest path to real revenue: one webhook endpoint, no code in your app.
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-4">
            <ol className="space-y-4 text-sm text-fg-muted">
              <li>
                <p className="font-medium text-fg">1. Add this endpoint in Stripe</p>
                <p className="mt-0.5 text-xs">
                  Developers → Webhooks → Add endpoint. Send{" "}
                  <code className="font-mono text-xs text-fg">invoice.paid</code>,{" "}
                  <code className="font-mono text-xs text-fg">
                    customer.subscription.created
                  </code>{" "}
                  and{" "}
                  <code className="font-mono text-xs text-fg">
                    checkout.session.completed
                  </code>
                  .
                </p>
                <CodeBlock code={webhookUrl} className="mt-2" />
              </li>

              <li>
                <p className="font-medium text-fg">2. Set the signing secret</p>
                <p className="mt-0.5 text-xs">
                  Generate one here and paste it into Stripe&rsquo;s endpoint settings. Requests
                  that do not carry a matching signature are rejected before anything is
                  written — this is what stops anyone posting fake revenue to a public URL.
                </p>
                <div className="mt-2">
                  <StripeSecretForm workspaceSlug={workspace.slug} configured={configured} />
                </div>
              </li>
            </ol>

            {configured ? (
              <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
                <p className="text-xs text-fg-subtle">
                  {stripeCount > 0
                    ? `${formatCount(stripeCount)} conversions received from Stripe.`
                    : "No events received yet. Use Stripe's “Send test webhook” to check it."}
                </p>
                <form action={disconnectStripeAction}>
                  <input type="hidden" name="workspace" value={workspace.slug} />
                  <Button type="submit" size="sm" variant="secondary">
                    Disconnect
                  </Button>
                </form>
              </div>
            ) : null}

            <p className="text-xs text-fg-subtle">
              Annual plans are divided by twelve so MRR means the same thing however you bill.
              Stripe retries aggressively; a replayed event returns the original conversion
              rather than duplicating it.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All sources</CardTitle>
          </CardHeader>
          <CardBody>
            {bySource.length === 0 ? (
              <p className="text-sm text-fg-muted">No conversions recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {bySource.map((entry) => (
                  <li key={entry.source} className="flex items-center justify-between text-sm">
                    <span className="text-fg">{entry.source}</span>
                    <span className="tabular text-fg-muted">{formatCount(entry._count)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-fg-subtle">
              CRM pipeline stages, so lead quality is attributed too, arrive in a later phase.
            </p>
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
