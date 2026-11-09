import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { PhasePlaceholder } from "@/components/app-shell/phase-placeholder";

export const metadata: Metadata = { title: "Team" };

export default function TeamSettingsPage() {
  return (
    <>
      <PageHeader title="Team" description="Who can see and change this workspace." />
      <PageBody>
        <PhasePlaceholder
          icon="settings"
          title="You are the only member"
          description="Invite teammates with a role: owners and admins manage settings and billing, members work day to day, viewers get read-only access."
          willShow={[
            "Email invitations with a role per member",
            "Owner, admin, member and viewer roles enforced server-side",
            "An audit log of who changed what",
          ]}
        />
      </PageBody>
    </>
  );
}
