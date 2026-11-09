import Link from "next/link";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-bg-subtle px-5 text-center">
      <Logo />
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Not found</h1>
        <p className="mt-1.5 max-w-sm text-sm text-fg-muted">
          This page doesn&rsquo;t exist, or the workspace isn&rsquo;t one your account can open.
        </p>
      </div>
      <Button asChild>
        <Link href="/app">Back to your dashboard</Link>
      </Button>
    </div>
  );
}
