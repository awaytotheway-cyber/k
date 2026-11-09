import { cn } from "@/lib/cn";

export type InputProps = React.ComponentPropsWithoutRef<"input">;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[var(--radius)] border border-[var(--border-strong)]",
        "bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle",
        "transition-colors focus:border-primary focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"label">) {
  return (
    <label className={cn("block text-sm font-medium text-fg", className)} {...props}>
      {children}
    </label>
  );
}

/** Inline validation message, wired to an input via aria-describedby. */
export function FieldError({ children, id }: { children?: string; id?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="text-sm text-danger">
      {children}
    </p>
  );
}
