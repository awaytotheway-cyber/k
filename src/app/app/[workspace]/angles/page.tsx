import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { PhasePlaceholder } from "@/components/app-shell/phase-placeholder";

export const metadata: Metadata = { title: "Winning angles" };

export default function AnglesPage() {
  return (
    <>
      <PageHeader
        title="Winning angles"
        description="Which creative angles work for you, and which work for companies like you."
      />
      <PageBody>
        <PhasePlaceholder
          icon="angles"
          title="Angle analysis needs your ads first"
          description="Every ad gets tagged with the angle it runs on — ROI calculator, founder story, competitor switch, free audit — so you can see which framing wins rather than which image did."
          willShow={[
            "Your angle leaderboard: spend, CAC and conversion rate per angle",
            "Opt-in anonymized medians for your category, so you know whether $112 is good",
            "Angles proven in your category that you have never tested",
            "Three ready-to-run ad concepts in a winning angle",
          ]}
        />
      </PageBody>
    </>
  );
}
