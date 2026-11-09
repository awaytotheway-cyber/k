import { cn } from "@/lib/cn";

/**
 * The empty state is the most-seen screen in a new account, so each one names
 * the single action that fills it rather than apologising for having no data.
 *
 * `hint` is for the "why is this empty" explanation; `action` must be the one
 * thing that resolves it.
 */
export function EmptyState({
  icon,
  title,
  description,
  hint,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius)]",
        "border border-dashed border-[var(--border-strong)] bg-bg-subtle",
        "px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-primary-subtle text-primary">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-fg-muted">{description}</p>
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
      {hint ? <div className="mt-5 w-full max-w-lg text-left">{hint}</div> : null}
    </div>
  );
}
