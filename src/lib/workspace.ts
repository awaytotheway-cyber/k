/**
 * Tenancy guards.
 *
 * Every authenticated page and API route goes through one of these. The rule is
 * that access is proven by a database join (workspace -> org -> membership ->
 * this user), never by trusting a slug or id from the URL. Returning 404 rather
 * than 403 for a workspace the caller cannot see avoids confirming it exists.
 */
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";

export type SessionUser = { id: string; email: string; name: string | null };

/** The signed-in user, or a redirect to login. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true },
  });
  // Token still valid but the row is gone (deleted account): treat as signed out.
  if (!user) redirect("/login");

  return user;
}

/** The signed-in user, or null. For pages that render either way. */
export async function getOptionalUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true },
  });
}

const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export type WorkspaceContext = {
  user: SessionUser;
  role: Role;
  workspace: {
    id: string;
    slug: string;
    name: string;
    orgId: string;
    currency: string;
    timezone: string;
    category: string | null;
    targetCacCents: number | null;
    pixelKey: string;
    lookbackDays: number;
    isDemo: boolean;
  };
  org: {
    id: string;
    name: string;
    plan: string;
    planStatus: string;
    trialEndsAt: Date | null;
  };
};

/**
 * Resolve a workspace the current user may access, enforcing a minimum role.
 *
 * @param slug     workspace slug from the route
 * @param minRole  lowest role allowed; defaults to VIEWER (read access)
 */
export async function requireWorkspaceAccess(
  slug: string,
  minRole: Role = "VIEWER",
): Promise<WorkspaceContext> {
  const user = await requireUser();

  const workspace = await db.workspace.findFirst({
    // The membership filter is the authorization check: a workspace the user
    // has no membership for simply does not match.
    where: { slug, org: { memberships: { some: { userId: user.id } } } },
    select: {
      id: true,
      slug: true,
      name: true,
      orgId: true,
      currency: true,
      timezone: true,
      category: true,
      targetCacCents: true,
      pixelKey: true,
      lookbackDays: true,
      isDemo: true,
      org: {
        select: {
          id: true,
          name: true,
          plan: true,
          planStatus: true,
          trialEndsAt: true,
          memberships: {
            where: { userId: user.id },
            select: { role: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!workspace) notFound();

  const role = workspace.org.memberships[0]?.role;
  if (!role) notFound();

  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new Error(`Requires ${minRole} access; you have ${role}.`);
  }

  const { org, ...ws } = workspace;
  return {
    user,
    role,
    workspace: ws,
    org: {
      id: org.id,
      name: org.name,
      plan: org.plan,
      planStatus: org.planStatus,
      trialEndsAt: org.trialEndsAt,
    },
  };
}

/** Every workspace the user can see, for the workspace switcher. */
export async function listAccessibleWorkspaces(userId: string) {
  return db.workspace.findMany({
    where: { org: { memberships: { some: { userId } } } },
    select: { id: true, slug: true, name: true, isDemo: true },
    orderBy: [{ isDemo: "asc" }, { createdAt: "asc" }],
  });
}

/** Where to send someone who lands on /app with no workspace in the URL. */
export async function defaultWorkspaceSlug(userId: string): Promise<string | null> {
  const first = await db.workspace.findFirst({
    where: { org: { memberships: { some: { userId } } } },
    select: { slug: true },
    orderBy: [{ isDemo: "asc" }, { createdAt: "asc" }],
  });
  return first?.slug ?? null;
}
