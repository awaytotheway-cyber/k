import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { PhasePlaceholder } from "@/components/app-shell/phase-placeholder";

export const metadata: Metadata = { title: "Tracking health" };

export default function HealthPage() {
  return (
    <>
      <PageHeader
        title="Tracking health"
        description="Attribution breaking quietly is the worst failure mode. This page makes it loud."
      />
      <PageBody>
        <PhasePlaceholder
          icon="health"
          title="Health checks start once the pixel is live"
          description="We watch for the ways tracking silently dies — a pixel removed in a deploy, Google auto-tagging switched off, a webhook that stopped firing — and tell you the same day instead of at month end."
          willShow={[
            "Is the pixel firing? Events in the last 24 hours, by click-id type",
            "Platform-reported conversions vs what we tracked, as a discrepancy percentage",
            "Alerts when a click-id type stops arriving, or spend and CPA move abnormally",
            "A plain-language explanation and fix for each issue found",
          ]}
        />
      </PageBody>
    </>
  );
}
