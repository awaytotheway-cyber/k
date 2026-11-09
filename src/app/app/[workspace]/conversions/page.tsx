import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { PhasePlaceholder } from "@/components/app-shell/phase-placeholder";

export const metadata: Metadata = { title: "Conversions" };

export default function ConversionsPage() {
  return (
    <>
      <PageHeader
        title="Conversions"
        description="Searchable history of every signup, trial and payment, and the ads behind it."
      />
      <PageBody>
        <PhasePlaceholder
          icon="conversions"
          title="No conversions recorded yet"
          description="Send conversions from Stripe or the API and they appear here within seconds."
          willShow={[
            "One row per conversion with its value, MRR and source",
            "Expand any row to see the full touch path — every ad that customer saw first",
            "Filter by event type, campaign, date range and attributed platform",
            "Full-text search by email or external id",
          ]}
        />
      </PageBody>
    </>
  );
}
