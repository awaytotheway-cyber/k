"use server";

import { revalidatePath } from "next/cache";

import { parseSpendCsv } from "@/lib/adapters/csv";
import { applySpendRows } from "@/lib/adapters/import";
import { attributeWorkspace } from "@/lib/attribution/engine";
import { resolveTouchAds } from "@/lib/attribution/resolve-ads";
import type { Platform } from "@/generated/prisma/enums";
import { requireWorkspaceAccess } from "@/lib/workspace";

export type ImportState = {
  error?: string;
  /** Row-level problems, so the user can fix the file rather than guess. */
  issues?: Array<{ row: number; message: string }>;
  summary?: {
    importedRows: number;
    updatedRows: number;
    createdCampaigns: number;
    createdAdSets: number;
    createdAds: number;
    skipped: number;
  };
};

/** Refuse a file this large before reading it into memory. */
const MAX_BYTES = 10 * 1024 * 1024;

const PLATFORMS: Platform[] = ["META", "GOOGLE", "TIKTOK", "LINKEDIN", "MICROSOFT", "OTHER"];

export async function importSpendAction(
  _prev: ImportState | undefined,
  formData: FormData,
): Promise<ImportState> {
  const slug = String(formData.get("workspace") ?? "");
  // Spend changes every CAC in the workspace, so this is an admin action.
  const { workspace } = await requireWorkspaceAccess(slug, "ADMIN");

  const platformRaw = String(formData.get("platform") ?? "META");
  const platform: Platform = (PLATFORMS as string[]).includes(platformRaw)
    ? (platformRaw as Platform)
    : "OTHER";

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to upload." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "That file is larger than 10 MB. Split it and import in parts." };
  }

  const text = await file.text();
  const parsed = parseSpendCsv(text);

  // Nothing usable: report the problems rather than a silent no-op.
  if (parsed.rows.length === 0) {
    return {
      error: "Nothing could be imported from that file.",
      issues: parsed.errors.slice(0, 10),
    };
  }

  const result = await applySpendRows(workspace.id, platform, parsed.rows, {
    filename: file.name,
    mapping: parsed.columns,
  });

  // Clicks almost always arrive before the spend export that creates the ad
  // they came from, so link them now that those ads exist, then recompute
  // credit. Without this the CSV path yields platform totals and no per-ad
  // numbers at all.
  try {
    await resolveTouchAds(workspace.id);
    await attributeWorkspace(workspace.id);
  } catch (error) {
    console.error("[import] re-attribution failed", error);
  }

  revalidatePath(`/app/${slug}`, "layout");

  return {
    summary: {
      importedRows: result.importedRows,
      updatedRows: result.updatedRows,
      createdCampaigns: result.createdCampaigns,
      createdAdSets: result.createdAdSets,
      createdAds: result.createdAds,
      skipped: parsed.errors.length,
    },
    // Partial success is still success; show what was skipped and why.
    issues: parsed.errors.slice(0, 10),
  };
}
