import Link from "next/link";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getOptionalUser } from "@/lib/workspace";

/**
 * Holding page. The full marketing site — the loop as a visual, real product
 * screenshots, pricing and the honest competitor FAQ — is Phase 2, once there
 * are screenshots worth showing.
 */
export default async function LandingPage() {
  const user = await getOptionalUser();

  const steps = [
    {
      title: "Capture the click",
      body: "A first-party snippet reads the ad click id off every landing URL, so the link between a click and a person survives ad blockers and Safari.",
    },
    {
      title: "Record the money",
      body: "Stripe webhooks and a simple API bring in trials, demos and paid subscriptions — with MRR, not just event counts.",
    },
    {
      title: "Credit the right ad",
      body: "Five attribution models run at once, so you can see where the choice of model is actually changing the answer.",
    },
    {
      title: "Decide",
      body: "A daily brief ranks what to scale and what to cut, with the projected dollar impact and the confidence interval behind it.",
    },
  ];

  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <Button asChild size="sm">
              <Link href="/app">Open dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">Start free</Link>
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-24 sm:px-8">
        <section className="pt-10 sm:pt-20">
          <p className="text-sm font-medium text-primary">
            Marketing attribution for B2B SaaS
          </p>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-fg sm:text-5xl sm:leading-[1.1]">
            Know which ad made the money.
          </h1>
          <p className="mt-5 max-w-xl text-base text-fg-muted sm:text-lg">
            Tie every trial and every dollar of MRR back to the exact ad that produced it — then
            find out whether you have enough data to act on it yet.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/signup">Start a 14-day trial</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
          <p className="mt-3 text-sm text-fg-subtle">No card required.</p>
        </section>

        <section className="mt-20 border-t border-[var(--border)] pt-12">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
            The loop
          </h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <li key={step.title}>
                <span className="font-mono text-xs text-primary">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-1.5 text-sm font-semibold text-fg">{step.title}</h3>
                <p className="mt-1.5 text-sm text-fg-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16 rounded-[var(--radius)] border border-[var(--border)] bg-surface p-6 sm:p-8">
          <h2 className="text-base font-semibold text-fg">
            Most attribution tools let you kill an ad on two conversions.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">
            We show the uncertainty instead of hiding it. An ad with a CAC of $310 and two
            conversions is not a bad ad — it is an untested one, and we say so, along with how
            many more conversions you need before the number means anything.
          </p>
          <div className="mt-5 overflow-x-auto">
            <pre className="w-fit rounded-md border border-[var(--border)] bg-bg-subtle p-3 font-mono text-xs leading-relaxed text-fg">
              {`CAC $94   (95% CI $61–$210)     n=11   LIKELY GOOD   scale
CAC $310  (95% CI $88–$2,400)   n=2    TOO EARLY     hold`}
            </pre>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-6 text-sm text-fg-subtle sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Logo />
          <p>Attribution is an estimate. We show you how good an estimate it is.</p>
        </div>
      </footer>
    </div>
  );
}
