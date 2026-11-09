import { Sidebar } from "@/components/app-shell/sidebar";
import { listAccessibleWorkspaces, requireWorkspaceAccess } from "@/lib/workspace";

/**
 * Authenticated shell. requireWorkspaceAccess proves, by database join, that
 * this user may see this workspace — layouts in the App Router run on every
 * request for their subtree, and each page/route repeats the check at the data
 * layer rather than trusting that this one ran.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace, user } = await requireWorkspaceAccess(slug);
  const workspaces = await listAccessibleWorkspaces(user.id);

  const current = {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    isDemo: workspace.isDemo,
  };

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar workspace={current} workspaces={workspaces} user={user} />
      <main className="min-w-0 flex-1 bg-bg">{children}</main>
    </div>
  );
}
