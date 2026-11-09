import { requireWorkspaceAccess } from "@/lib/workspace";

/**
 * A sample spend CSV in the exact shape the importer expects.
 *
 * Column names match a real Meta Ads Manager export rather than being
 * invented, so someone can compare it against their own file and see at a
 * glance which column is which.
 */
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspace: string }> },
) {
  const { workspace } = await params;
  // Not secret, but it is workspace-scoped UI: require access anyway.
  await requireWorkspaceAccess(workspace);

  const today = new Date();
  const day = (offset: number) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
  };

  const csv = [
    "Reporting starts,Campaign name,Ad set name,Ad name,Amount spent (USD),Impressions,Link clicks",
    `${day(3)},Prospecting — SaaS founders,Lookalike 1% — US,ROI calc — cut CAC in half,"1,284.50",48210,412`,
    `${day(3)},Prospecting — SaaS founders,Lookalike 1% — US,Founder story,742.10,31002,266`,
    `${day(2)},Prospecting — SaaS founders,Lookalike 1% — US,ROI calc — cut CAC in half,"1,190.00",44980,388`,
    `${day(2)},Search — brand + competitor,Competitor terms,vs Hyros,886.25,9140,121`,
    `${day(1)},Search — brand + competitor,Brand terms,Brand — exact,131.40,4120,702`,
    "",
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="trueroas-spend-sample.csv"',
      "Cache-Control": "no-store",
    },
  });
}
