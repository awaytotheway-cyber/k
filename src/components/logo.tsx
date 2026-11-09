import { cn } from "@/lib/cn";

/**
 * Wordmark. The glyph is a rising bar with a tick — cost going in, confirmed
 * revenue coming out — which is the product in one shape.
 */
export function Logo({
  className,
  showWord = true,
}: {
  className?: string;
  showWord?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 28 28" className="size-7 shrink-0" aria-hidden="true">
        <rect width="28" height="28" rx="7" fill="var(--primary)" />
        <path
          d="M8 18.5v-4M13 18.5v-7M18 18.5v-3"
          stroke="var(--primary-fg)"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M7.5 11.5l4.5 4.5L21 7.5"
          stroke="var(--primary-fg)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showWord ? (
        <span className="text-[15px] font-semibold tracking-tight text-fg">TrueROAS</span>
      ) : null}
      <span className="sr-only">TrueROAS</span>
    </span>
  );
}
