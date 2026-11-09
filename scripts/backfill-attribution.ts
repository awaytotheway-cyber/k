/**
 * Recompute attribution for a workspace.
 *
 *   npm run attribution:backfill                 # every workspace
 *   npm run attribution:backfill -- acme-demo    # one, by slug
 *
 * Needed after seeding, after importing historical conversions, and after a
 * workspace changes its lookback window. Safe to run repeatedly: existing
 * credit rows are replaced, never added to.
 */
import "dotenv/config";

import { attributeWorkspace } from "../src/lib/attribution/engine";
import { db } from "../src/lib/db";

async function main() {
  const slug = process.argv[2];

  const workspaces = await db.workspace.findMany({
    where: slug ? { slug } : {},
    select: { id: true, slug: true, name: true, lookbackDays: true },
    orderBy: { createdAt: "asc" },
  });

  if (workspaces.length === 0) {
    console.error(slug ? `No workspace with slug "${slug}".` : "No workspaces found.");
    process.exitCode = 1;
    return;
  }

  for (const workspace of workspaces) {
    const started = Date.now();
    process.stdout.write(`${workspace.name} (${workspace.slug}) … `);

    const { conversions, rows } = await attributeWorkspace(workspace.id);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    console.log(
      `${conversions.toLocaleString()} conversions → ${rows.toLocaleString()} credit rows ` +
        `(${workspace.lookbackDays}d lookback, ${seconds}s)`,
    );
  }
}

main()
  .catch((error) => {
    console.error("\nBackfill failed:\n", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
