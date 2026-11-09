import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { getOptionalUser } from "@/lib/workspace";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  // Already signed in: no reason to show a login form.
  if (await getOptionalUser()) redirect("/app");

  const { redirectTo } = await searchParams;

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-fg">Log in</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Welcome back. Pick up where your numbers left off.
      </p>

      <div className="mt-6">
        {/* Only accept in-app relative paths, so ?redirectTo= cannot bounce
            a freshly authenticated user to another origin. */}
        <LoginForm redirectTo={redirectTo?.startsWith("/") ? redirectTo : "/app"} />
      </div>

      <p className="mt-6 text-sm text-fg-muted">
        No account yet?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Start a free trial
        </Link>
      </p>
    </div>
  );
}
