"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { generateWebhookSecret } from "@/lib/stripe-webhook";
import { requireWorkspaceAccess } from "@/lib/workspace";

export type StripeConnectState = { error?: string; secret?: string };

/**
 * Mint a signing secret for this workspace's inbound Stripe webhook.
 *
 * Unlike an API key this is stored in plaintext: verifying a signature
 * requires the secret itself, so a hash would be useless. It is shown once in
 * the UI because the customer must paste it into Stripe, and regenerating it
 * immediately invalidates the old one.
 */
export async function regenerateStripeSecretAction(
  _prev: StripeConnectState | undefined,
  formData: FormData,
): Promise<StripeConnectState> {
  const slug = String(formData.get("workspace") ?? "");
  const { workspace } = await requireWorkspaceAccess(slug, "ADMIN");

  const secret = generateWebhookSecret();
  await db.workspace.update({
    where: { id: workspace.id },
    data: { stripeWebhookSecret: secret },
  });

  revalidatePath(`/app/${slug}/settings/conversions`);
  return { secret };
}

export async function disconnectStripeAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("workspace") ?? "");
  const { workspace } = await requireWorkspaceAccess(slug, "ADMIN");

  await db.workspace.update({
    where: { id: workspace.id },
    data: { stripeWebhookSecret: null },
  });

  revalidatePath(`/app/${slug}/settings/conversions`);
}
