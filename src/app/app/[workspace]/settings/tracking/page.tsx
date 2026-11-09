import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { PhasePlaceholder } from "@/components/app-shell/phase-placeholder";

export const metadata: Metadata = { title: "Tracking & API keys" };

export default function TrackingSettingsPage() {
  return (
    <>
      <PageHeader title="Tracking & API keys" description="The snippet, your API keys, and how visitors are identified." />
      <PageBody>
        <PhasePlaceholder
          icon="settings"
          title="API keys arrive with the ingest API"
          description="Server-side conversions authenticate with a bearer key. Keys are shown once at creation and only a hash is stored."
          willShow={[
            "Create and revoke named API keys, with last-used timestamps",
            "Verify the snippet is installed, live",
            "Choose the attribution lookback window",
            "Set your target CAC, which drives the scale and cut verdicts",
          ]}
        />
      </PageBody>
    </>
  );
}
