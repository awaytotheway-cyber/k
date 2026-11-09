import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { PhasePlaceholder } from "@/components/app-shell/phase-placeholder";

export const metadata: Metadata = { title: "Conversion sources" };

export default function ConversionSettingsPage() {
  return (
    <>
      <PageHeader title="Conversion sources" description="Where your revenue comes from." />
      <PageBody>
        <PhasePlaceholder
          icon="conversions"
          title="No conversion sources connected"
          description="Stripe is the fastest path to real revenue data: add one webhook endpoint and paid subscriptions start attributing themselves."
          willShow={[
            "Stripe webhook with a per-workspace signing secret",
            "Map Stripe events to conversion types, and subscriptions to MRR",
            "HubSpot pipeline stages, so lead quality is attributed too",
            "Manual and CSV conversion import for historical backfill",
          ]}
        />
      </PageBody>
    </>
  );
}
