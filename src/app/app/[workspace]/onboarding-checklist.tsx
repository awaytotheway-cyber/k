import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { cn } from "@/lib/cn";

type OnboardingState = {
  hasTouches: boolean;
  hasConversions: boolean;
  hasSpend: boolean;
  hasApiKey: boolean;
};

/**
 * The first-run path, as three steps in the order they must happen: identify the
 * click, record the money, then add the cost. Each step states what it unlocks,
 * because "install a pixel" is a chore and "see which ad produced that trial" is
 * a reason.
 */
export function OnboardingChecklist({
  appUrl,
  pixelKey,
  workspaceSlug,
  state,
}: {
  appUrl: string;
  pixelKey: string;
  workspaceSlug: string;
  state: OnboardingState;
}) {
  const snippet = `<script async src="${appUrl}/t.js" data-key="${pixelKey}"></script>`;

  const conversionCurl = [
    `curl -X POST ${appUrl}/api/v1/conversions \\`,
    `  -H "Authorization: Bearer YOUR_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{`,
    `    "eventName": "trial_started",`,
    `    "eventType": "TRIAL",`,
    `    "email": "jane@acme.com",`,
    `    "mrrCents": 9900`,
    `  }'`,
  ].join("\n");

  return (
    <div className="space-y-4">
      <Step
        index={1}
        done={state.hasTouches}
        title="Install the tracking snippet"
        unlocks="Captures the ad click id on every visit — the link between a click and a customer."
      >
        <p className="text-sm text-fg-muted">
          Paste this into the <code className="font-mono text-xs text-fg">&lt;head&gt;</code> of
          every page, including your marketing site and your app.
        </p>
        <CodeBlock code={snippet} language="html" className="mt-3" />
        <p className="mt-3 text-xs text-fg-subtle">
          Served from your own domain, so ad blockers and Safari&rsquo;s tracking prevention
          don&rsquo;t strip it. No cookie banner changes needed: it sets one first-party cookie
          and stores a hashed IP, never a raw one.
        </p>
        {!state.hasTouches ? (
          <p className="mt-3 inline-flex items-center gap-2 text-xs text-fg-muted">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            Waiting for the first event. Reload this page after visiting your site.
          </p>
        ) : null}
      </Step>

      <Step
        index={2}
        done={state.hasConversions}
        title="Send your conversions"
        unlocks="Turns visits into revenue. Without this there is nothing to attribute."
      >
        <p className="text-sm text-fg-muted">
          Point your Stripe webhook at us for real revenue, or call the API directly from your
          signup and upgrade flows.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/app/${workspaceSlug}/settings/conversions`}>
              Connect Stripe
            </Link>
          </Button>
          {!state.hasApiKey ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/app/${workspaceSlug}/settings/tracking`}>Create an API key</Link>
            </Button>
          ) : null}
        </div>
        <CodeBlock code={conversionCurl} language="bash" className="mt-3" />
      </Step>

      <Step
        index={3}
        done={state.hasSpend}
        title="Add what you spent"
        unlocks="The cost side of the equation. Revenue without spend is not ROAS."
        last
      >
        <p className="text-sm text-fg-muted">
          Upload a spend export from Meta or Google Ads — we&rsquo;ll map the columns for you.
          Direct platform sync arrives once our Meta app review clears; nothing you import now
          is wasted.
        </p>
        <div className="mt-3">
          <Button asChild size="sm" variant="secondary">
            <Link href={`/app/${workspaceSlug}/settings/ad-accounts`}>Import spend</Link>
          </Button>
        </div>
      </Step>
    </div>
  );
}

function Step({
  index,
  done,
  title,
  unlocks,
  children,
  last = false,
}: {
  index: number;
  done: boolean;
  title: string;
  unlocks: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <Card className={cn(done && "opacity-70")}>
      <CardBody className="flex gap-4">
        <div className="flex flex-col items-center">
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              done
                ? "bg-success text-white"
                : "border border-[var(--border-strong)] bg-surface text-fg-muted",
            )}
          >
            {done ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3.5"
                aria-hidden="true"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              index
            )}
          </span>
          {!last ? <span className="mt-1 w-px flex-1 bg-[var(--border)]" /> : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-fg">{title}</h3>
            {done ? <span className="text-xs font-medium text-success">Done</span> : null}
          </div>
          <p className="mt-0.5 text-xs text-fg-subtle">{unlocks}</p>
          <div className="mt-3">{children}</div>
        </div>
      </CardBody>
    </Card>
  );
}
