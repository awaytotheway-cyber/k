"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  createApiKeyAction,
  updateWorkspaceSettingsAction,
  type ApiKeyState,
  type SettingsState,
} from "@/lib/actions/workspace-actions";

function Submit({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}

export function CreateApiKeyForm({ workspaceSlug }: { workspaceSlug: string }) {
  const [state, action] = useActionState<ApiKeyState | undefined, FormData>(
    createApiKeyAction,
    undefined,
  );

  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="workspace" value={workspaceSlug} />
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="label">New key name</Label>
          <Input id="label" name="label" placeholder="Production backend" required />
        </div>
        <Submit idle="Create key" busy="Creating…" />
      </form>

      <FieldError>{state?.error}</FieldError>

      {state?.plaintext ? (
        <div className="rounded-[var(--radius)] border border-warning bg-warning-subtle p-3">
          <p className="text-sm font-medium text-fg">Copy this now — it is shown once.</p>
          <p className="mt-1 text-xs text-fg-muted">
            Only a hash is stored, so we cannot show it to you again. Lose it and you create a
            new one.
          </p>
          <CodeBlock code={state.plaintext} className="mt-2" />
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceSettingsForm({
  workspaceSlug,
  targetCacCents,
  lookbackDays,
}: {
  workspaceSlug: string;
  targetCacCents: number | null;
  lookbackDays: number;
}) {
  const [state, action] = useActionState<SettingsState | undefined, FormData>(
    updateWorkspaceSettingsAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="workspace" value={workspaceSlug} />

      <div className="space-y-1.5">
        <Label htmlFor="targetCac">Target CAC (USD)</Label>
        <Input
          id="targetCac"
          name="targetCac"
          type="number"
          min="0"
          step="1"
          inputMode="decimal"
          defaultValue={targetCacCents === null ? "" : String(targetCacCents / 100)}
          placeholder="180"
        />
        <p className="text-xs text-fg-subtle">
          What you are willing to pay for one conversion. Without it we can show a CAC and its
          interval, but not a scale-or-cut verdict.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lookbackDays">Attribution lookback (days)</Label>
        <Input
          id="lookbackDays"
          name="lookbackDays"
          type="number"
          min="1"
          max="365"
          defaultValue={String(lookbackDays)}
        />
        <p className="text-xs text-fg-subtle">
          How long after a click a conversion can still be credited to it. 90 days suits most
          B2B SaaS sales cycles.
        </p>
      </div>

      {state?.error ? (
        <p
          role="alert"
          className="rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning"
        >
          {state.error}
        </p>
      ) : null}
      {state?.saved && !state.error ? (
        <p className="text-sm text-success">Saved.</p>
      ) : null}

      <Submit idle="Save settings" busy="Saving…" />
    </form>
  );
}
