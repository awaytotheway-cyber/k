import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { PhasePlaceholder } from "@/components/app-shell/phase-placeholder";

export const metadata: Metadata = { title: "Billing" };

export default function BillingSettingsPage() {
  return (
    <>
      <PageHeader title="Billing" description="Plan, usage and invoices." />
      <PageBody>
        <PhasePlaceholder
          icon="settings"
          title="Billing arrives with the paid tiers"
          description="Starter, Growth and Agency, monthly or annual. A 14-day trial needs no card, and usage is metered against your plan's event allowance."
          willShow={[
            "Stripe Checkout and the customer portal for invoices and cards",
            "Tracked-event usage against your plan allowance",
            "Upgrade and downgrade with prorated billing",
          ]}
        />
      </PageBody>
    </>
  );
}
