"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { generateApiKey } from "@/lib/api-keys";
import { db } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspace";

export type ApiKeyState = {
  error?: string;
  /** Shown exactly once, immediately after creation. Never stored in plaintext. */
  plaintext?: string;
};

const labelSchema = z.string().trim().min(1, "Give the key a name").max(60);

export async function createApiKeyAction(
  _prev: ApiKeyState | undefined,
  formData: FormData,
): Promise<ApiKeyState> {
  const slug = String(formData.get("workspace") ?? "");
  // ADMIN and above: an API key can write revenue data into the workspace.
  const { workspace } = await requireWorkspaceAccess(slug, "ADMIN");

  const parsed = labelSchema.safeParse(formData.get("label"));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const { plaintext, hashedKey, prefix } = generateApiKey();

  await db.apiKey.create({
    data: { workspaceId: workspace.id, label: parsed.data, hashedKey, prefix },
  });

  revalidatePath(`/app/${slug}/settings/tracking`);
  return { plaintext };
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("workspace") ?? "");
  const keyId = String(formData.get("keyId") ?? "");
  const { workspace } = await requireWorkspaceAccess(slug, "ADMIN");

  // Scoped by workspace so an id from another tenant cannot be revoked.
  await db.apiKey.updateMany({
    where: { id: keyId, workspaceId: workspace.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  revalidatePath(`/app/${slug}/settings/tracking`);
}

export type SettingsState = { error?: string; saved?: boolean };

const settingsSchema = z.object({
  /** Dollars in the form; stored as cents. */
  targetCac: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v < 1_000_000), {
      message: "Enter a target CAC between 0 and 1,000,000",
    }),
  lookbackDays: z.coerce.number().int().min(1).max(365),
});

export async function updateWorkspaceSettingsAction(
  _prev: SettingsState | undefined,
  formData: FormData,
): Promise<SettingsState> {
  const slug = String(formData.get("workspace") ?? "");
  const { workspace } = await requireWorkspaceAccess(slug, "ADMIN");

  const parsed = settingsSchema.safeParse({
    targetCac: formData.get("targetCac") ?? "",
    lookbackDays: formData.get("lookbackDays") ?? 90,
  });

  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const lookbackChanged = parsed.data.lookbackDays !== workspace.lookbackDays;

  await db.workspace.update({
    where: { id: workspace.id },
    data: {
      targetCacCents:
        parsed.data.targetCac === null ? null : Math.round(parsed.data.targetCac * 100),
      lookbackDays: parsed.data.lookbackDays,
    },
  });

  revalidatePath(`/app/${slug}`, "layout");

  return {
    saved: true,
    // Changing the window changes which touches count, so existing credit is
    // now stale. Say so rather than letting the numbers quietly disagree.
    error: lookbackChanged
      ? "Saved. The lookback window changed, so run `npm run attribution:backfill` to recompute existing credit."
      : undefined,
  };
}
