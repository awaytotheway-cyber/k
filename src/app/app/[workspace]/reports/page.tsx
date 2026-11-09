import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { PhasePlaceholder } from "@/components/app-shell/phase-placeholder";

export const metadata: Metadata = { title: "Client reports" };

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Client reports"
        description="Share the numbers without sharing a login."
      />
      <PageBody>
        <PhasePlaceholder
          icon="reports"
          title="No report links yet"
          description="Generate a read-only link anyone can open — for a client, a manager or an investor update — scoped to the date range and sections you choose."
          willShow={[
            "Public read-only links with optional expiry, and a view count",
            "Scheduled weekly email digests",
            "Your own logo instead of ours, on the Agency plan",
          ]}
        />
      </PageBody>
    </>
  );
}
