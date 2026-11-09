import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { PhasePlaceholder } from "@/components/app-shell/phase-placeholder";

export const metadata: Metadata = { title: "Ads" };

export default function AdsPage() {
  return (
    <>
      <PageHeader
        title="Ads"
        description="Every ad, with what it cost and what it actually produced."
      />
      <PageBody>
        <PhasePlaceholder
          icon="ads"
          title="No ad performance yet"
          description="Once spend is imported and conversions are arriving, every ad shows up here with its true cost per acquisition."
          willShow={[
            "CAC per ad with a 95% credible interval, so you never kill an ad on two conversions",
            "A verdict per ad: scale, cut, watch, or too early to tell",
            "Search, date range, platform and campaign filters, saved as named views",
            "Side-by-side credited revenue under all five attribution models",
          ]}
        />
      </PageBody>
    </>
  );
}
