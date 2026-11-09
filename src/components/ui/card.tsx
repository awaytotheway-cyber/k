import { cn } from "@/lib/cn";

export function Card({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-[var(--border)] bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return <div className={cn("border-b border-[var(--border)] px-5 py-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentPropsWithoutRef<"h2">) {
  return <h2 className={cn("text-sm font-semibold text-fg", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentPropsWithoutRef<"p">) {
  return <p className={cn("mt-1 text-sm text-fg-muted", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}
