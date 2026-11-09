"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { importSpendAction, type ImportState } from "@/lib/actions/import-actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Importing…" : "Import spend"}
    </Button>
  );
}

export function ImportSpendForm({ workspaceSlug }: { workspaceSlug: string }) {
  const [state, action] = useActionState<ImportState | undefined, FormData>(
    importSpendAction,
    undefined,
  );

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="workspace" value={workspaceSlug} />

        <div className="space-y-1.5">
          <Label htmlFor="platform">Platform</Label>
          <select
            id="platform"
            name="platform"
            defaultValue="META"
            className="h-10 w-full rounded-[var(--radius)] border border-[var(--border-strong)] bg-surface px-3 text-sm text-fg"
          >
            <option value="META">Meta</option>
            <option value="GOOGLE">Google Ads</option>
            <option value="TIKTOK">TikTok</option>
            <option value="LINKEDIN">LinkedIn</option>
            <option value="MICROSOFT">Microsoft</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="file">Spend export (CSV)</Label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            required
            className="block w-full text-sm text-fg-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-fg hover:file:bg-primary-hover"
          />
          <p className="text-xs text-fg-subtle">
            Export straight from Meta Ads Manager or Google Ads — we read their column names as
            they come. Re-importing the same period corrects it rather than doubling it.
          </p>
        </div>

        <Submit />
      </form>

      {state?.error ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      {state?.summary ? (
        <div className="rounded-[var(--radius)] border border-success bg-success-subtle p-3">
          <p className="text-sm font-medium text-fg">
            Imported {state.summary.importedRows.toLocaleString()} rows.
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-fg-muted">
            {state.summary.updatedRows > 0 ? (
              <li>{state.summary.updatedRows.toLocaleString()} replaced an earlier figure</li>
            ) : null}
            {state.summary.createdCampaigns > 0 ? (
              <li>{state.summary.createdCampaigns} new campaigns</li>
            ) : null}
            {state.summary.createdAds > 0 ? <li>{state.summary.createdAds} new ads</li> : null}
            {state.summary.skipped > 0 ? (
              <li className="text-warning">{state.summary.skipped} rows skipped — see below</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {state?.issues && state.issues.length > 0 ? (
        <div className="rounded-[var(--radius)] border border-warning bg-warning-subtle p-3">
          <p className="text-sm font-medium text-fg">Rows that could not be read</p>
          <ul className="mt-1.5 space-y-1">
            {state.issues.map((issue) => (
              <li key={`${issue.row}-${issue.message}`} className="text-xs text-fg-muted">
                <span className="tabular font-medium text-fg">
                  {issue.row > 0 ? `Line ${issue.row}` : "File"}
                </span>{" "}
                — {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
