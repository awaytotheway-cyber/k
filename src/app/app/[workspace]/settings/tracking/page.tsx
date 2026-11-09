import type { Metadata } from "next";

import {
  CreateApiKeyForm,
  WorkspaceSettingsForm,
} from "@/app/app/[workspace]/settings/tracking/tracking-forms";
import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { revokeApiKeyAction } from "@/lib/actions/workspace-actions";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireWorkspaceAccess } from "@/lib/workspace";

export const metadata: Metadata = { title: "Tracking & API keys" };

export default async function TrackingSettingsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace } = await requireWorkspaceAccess(slug);

  const [keys, touchCount] = await Promise.all([
    db.apiKey.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        label: true,
        prefix: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    }),
    db.touch.count({ where: { workspaceId: workspace.id } }),
  ]);

  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const snippet = `<script async src="${appUrl}/t.js" data-key="${workspace.pixelKey}"></script>`;

  const curl = [
    `curl -X POST ${appUrl}/api/v1/conversions \\`,
    `  -H "Authorization: Bearer tr_live_YOUR_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{`,
    `    "eventName": "trial_started",`,
    `    "eventType": "TRIAL",`,
    `    "email": "jane@acme.com",`,
    `    "mrrCents": 9900`,
    `  }'`,
  ].join("\n");

  return (
    <>
      <PageHeader
        title="Tracking & API keys"
        description="The snippet, your keys, and how conversions are judged."
      />

      <PageBody className="max-w-3xl space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Tracking snippet</CardTitle>
            <CardDescription>
              Paste into the <code className="font-mono text-xs">&lt;head&gt;</code> of every
              page. The key is public by design — it only names a destination.
            </CardDescription>
          </CardHeader>
          <CardBody>
            <CodeBlock code={snippet} language="html" />
            <p className="mt-3 text-sm">
              {touchCount > 0 ? (
                <span className="text-success">
                  ✓ Receiving events — {touchCount.toLocaleString()} recorded.
                </span>
              ) : (
                <span className="text-fg-muted">
                  No events yet. Reload this page after visiting your site.
                </span>
              )}
            </p>
            <p className="mt-3 text-xs text-fg-subtle">
              Once someone gives you their email, call{" "}
              <code className="font-mono">
                window.trueroas.identify(&quot;they@company.com&quot;)
              </code>{" "}
              so their earlier ad clicks join up with the revenue they later produce.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Judging performance</CardTitle>
            <CardDescription>
              These two settings decide what counts as a win and how far back credit reaches.
            </CardDescription>
          </CardHeader>
          <CardBody>
            <WorkspaceSettingsForm
              workspaceSlug={workspace.slug}
              targetCacCents={workspace.targetCacCents}
              lookbackDays={workspace.lookbackDays}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API keys</CardTitle>
            <CardDescription>
              For sending conversions from your backend. Only a hash is stored.
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-5">
            <CreateApiKeyForm workspaceSlug={workspace.slug} />

            {keys.length > 0 ? (
              <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {keys.map((key) => (
                  <li key={key.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium text-fg">
                        {key.label}
                        {key.revokedAt ? <Badge>Revoked</Badge> : null}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-fg-subtle">{key.prefix}…</p>
                      <p className="mt-0.5 text-xs text-fg-subtle">
                        Created {key.createdAt.toLocaleDateString("en-US")}
                        {key.lastUsedAt
                          ? ` · last used ${key.lastUsedAt.toLocaleDateString("en-US")}`
                          : " · never used"}
                      </p>
                    </div>
                    {!key.revokedAt ? (
                      <form action={revokeApiKeyAction}>
                        <input type="hidden" name="workspace" value={workspace.slug} />
                        <input type="hidden" name="keyId" value={key.id} />
                        <Button type="submit" size="sm" variant="secondary">
                          Revoke
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            <div>
              <p className="mb-2 text-sm font-medium text-fg">Sending a conversion</p>
              <CodeBlock code={curl} language="bash" />
              <p className="mt-2 text-xs text-fg-subtle">
                Money is always in cents, never decimals — <code className="font-mono">9900</code>{" "}
                is $99.00. Send the same conversion twice and the second call returns the first
                one rather than duplicating it.
              </p>
            </div>
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
