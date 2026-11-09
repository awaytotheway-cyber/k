import { redirect } from "next/navigation";

import { defaultWorkspaceSlug, requireUser } from "@/lib/workspace";

/**
 * /app has no workspace in the URL, so send the user to their first one.
 * A signed-in user always has at least one workspace (signup creates it), so
 * the null branch means data was deleted out from under them.
 */
export default async function AppIndexPage() {
  const user = await requireUser();
  const slug = await defaultWorkspaceSlug(user.id);

  if (!slug) redirect("/login");
  redirect(`/app/${slug}`);
}
