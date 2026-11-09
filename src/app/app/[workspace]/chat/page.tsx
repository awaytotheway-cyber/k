import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { PhasePlaceholder } from "@/components/app-shell/phase-placeholder";

export const metadata: Metadata = { title: "Ask your data" };

export default function ChatPage() {
  return (
    <>
      <PageHeader
        title="Ask your data"
        description="Plain questions about spend, CAC and revenue, answered from your own numbers."
      />
      <PageBody>
        <PhasePlaceholder
          icon="chat"
          title="Chat arrives with the AI layer"
          description="Ask things like “which ad had the best CAC last month?” or “did the competitor-switch angle beat the ROI-calculator one?” and get an answer backed by the same figures the dashboard shows."
          willShow={[
            "Streaming answers over a typed query layer — no raw SQL, no invented numbers",
            "Every answer shows which query produced it",
            "Saved questions and thread history",
          ]}
        />
      </PageBody>
    </>
  );
}
