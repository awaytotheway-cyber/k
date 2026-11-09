import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { PhasePlaceholder } from "@/components/app-shell/phase-placeholder";

export const metadata: Metadata = { title: "Daily brief" };

export default function InsightsPage() {
  return (
    <>
      <PageHeader
        title="Daily brief"
        description="What to scale, what to cut, and what needs more data — every morning."
      />
      <PageBody>
        <PhasePlaceholder
          icon="insights"
          title="Your first brief needs a few days of data"
          description="The brief ranks every ad by what changing its budget is worth, with the reasoning shown. All figures are computed from your data, never estimated by the model."
          willShow={[
            "A ranked Scale / Cut / Watch list with projected monthly impact in dollars",
            "The reasoning behind each call, and the numbers it rests on",
            "Acknowledge, dismiss or mark actioned — and a weekly recap of what those decisions saved",
            "Delivered in-app and by email",
          ]}
        />
      </PageBody>
    </>
  );
}
