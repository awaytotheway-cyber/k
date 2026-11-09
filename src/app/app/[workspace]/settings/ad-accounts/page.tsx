import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { PhasePlaceholder } from "@/components/app-shell/phase-placeholder";

export const metadata: Metadata = { title: "Ad accounts & spend" };

export default function AdAccountSettingsPage() {
  return (
    <>
      <PageHeader title="Ad accounts & spend" description="The cost side: what you spent, by ad." />
      <PageBody>
        <PhasePlaceholder
          icon="ads"
          title="No spend imported yet"
          description="Upload a spend export and we will map the columns. Re-importing the same file is safe: rows upsert by entity and date rather than duplicating."
          willShow={[
            "CSV and Google Sheets import with a column mapper and preview",
            "A downloadable sample CSV in the expected shape",
            "Direct Meta and Google Ads sync once app review clears",
            "Push attributed conversions back to Meta CAPI and Google offline conversions",
          ]}
        />
      </PageBody>
    </>
  );
}
