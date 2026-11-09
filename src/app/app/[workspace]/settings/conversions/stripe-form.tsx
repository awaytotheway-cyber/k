"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import {
  regenerateStripeSecretAction,
  type StripeConnectState,
} from "@/lib/actions/stripe-actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

export function StripeSecretForm({
  workspaceSlug,
  configured,
}: {
  workspaceSlug: string;
  configured: boolean;
}) {
  const [state, action] = useActionState<StripeConnectState | undefined, FormData>(
    regenerateStripeSecretAction,
    undefined,
  );

  return (
    <div className="space-y-3">
      <form action={action}>
        <input type="hidden" name="workspace" value={workspaceSlug} />
        <Submit label={configured ? "Generate a new secret" : "Generate signing secret"} />
      </form>

      {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}

      {state?.secret ? (
        <div className="rounded-[var(--radius)] border border-warning bg-warning-subtle p-3">
          <p className="text-sm font-medium text-fg">
            Paste this into Stripe as the endpoint&rsquo;s signing secret.
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            Shown once. Generating another immediately stops the old one working.
          </p>
          <CodeBlock code={state.secret} className="mt-2" />
        </div>
      ) : null}
    </div>
  );
}
