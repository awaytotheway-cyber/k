"use server";

/**
 * Signup and login server actions.
 *
 * Signup creates the whole tenancy chain in one transaction — User,
 * Organization, OWNER Membership, and a first Workspace — so a new account can
 * never land in a half-built state where there is a user with nowhere to work.
 */
import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { uniqueSlug, workspaceNameFromEmail } from "@/lib/slug";

export type ActionState = { error?: string; fieldErrors?: Record<string, string> };

const TRIAL_DAYS = 14;

const signupSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(200, "That password is too long"),
  name: z.string().max(100).optional(),
  workspaceName: z.string().max(100).optional(),
});

export async function signupAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name") || undefined,
    workspaceName: formData.get("workspaceName") || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const password = parsed.data.password;

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { fieldErrors: { email: "An account with that email already exists" } };
  }

  const workspaceName = parsed.data.workspaceName?.trim() || workspaceNameFromEmail(email);
  const slug = await uniqueSlug(workspaceName, async (candidate) => {
    const hit = await db.workspace.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    return hit !== null;
  });

  const passwordHash = await hashPassword(password);
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  try {
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, name: parsed.data.name?.trim() || null },
        select: { id: true },
      });

      const org = await tx.organization.create({
        data: {
          name: workspaceName,
          plan: "TRIAL",
          planStatus: "TRIALING",
          trialEndsAt,
          memberships: { create: { userId: user.id, role: "OWNER" } },
        },
        select: { id: true },
      });

      await tx.workspace.create({
        data: { orgId: org.id, name: workspaceName, slug },
      });
    });
  } catch {
    // Unique violation from a concurrent signup on the same email is the only
    // expected failure here; anything else is equally unrecoverable for the user.
    return { error: "Could not create your account. Please try again." };
  }

  // Throws a redirect on success, which must not be swallowed.
  try {
    await signIn("credentials", { email, password, redirectTo: `/app/${slug}` });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created, but sign-in failed. Try logging in." };
    }
    throw error;
  }

  return {};
}

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export async function loginAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const redirectTo = (formData.get("redirectTo") as string) || "/app";

  try {
    await signIn("credentials", {
      email: parsed.data.email.toLowerCase().trim(),
      password: parsed.data.password,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // Deliberately does not distinguish unknown email from wrong password.
      return { error: "Incorrect email or password." };
    }
    throw error;
  }

  return {};
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
