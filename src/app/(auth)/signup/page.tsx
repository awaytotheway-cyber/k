import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignupForm } from "@/app/(auth)/signup/signup-form";
import { getOptionalUser } from "@/lib/workspace";

export const metadata: Metadata = { title: "Start your free trial" };

export default async function SignupPage() {
  if (await getOptionalUser()) redirect("/app");

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-fg">Start your free trial</h1>
      <p className="mt-1 text-sm text-fg-muted">
        14 days, no card. Install the pixel and see your real CAC the same day.
      </p>

      <div className="mt-6">
        <SignupForm />
      </div>

      <p className="mt-6 text-sm text-fg-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
