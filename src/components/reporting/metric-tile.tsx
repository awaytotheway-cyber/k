import { cn } from "@/lib/cn";
import { formatSignedPercent } from "@/lib/format";

/**
 * One headline number.
 *
 * The delta is shown with an explicit direction word as well as a colour, and
 * `lowerIsBetter` flips what counts as good — a falling CAC is a win, and
 * painting it red because the number went down would be actively misleading.
 */
export function MetricTile({
  label,
  value,
  hint,
  deltaPercent,
  lowerIsBetter = false,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  deltaPercent?: number | null;
  lowerIsBetter?: boolean;
  className?: string;
}) {
  const improved =
    deltaPercent === null || deltaPercent === undefined || deltaPercent === 0
      ? null
      : lowerIsBetter
        ? deltaPercent < 0
        : deltaPercent > 0;

  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-[var(--border)] bg-surface px-4 py-3.5",
        className,
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-fg-subtle">{label}</p>
      <p className="tabular mt-1.5 text-2xl font-semibold tracking-tight text-fg">{value}</p>

      <div className="mt-1 flex min-h-5 flex-wrap items-center gap-x-2 text-xs">
        {improved !== null ? (
          <span
            className={cn("tabular font-medium", improved ? "text-success" : "text-danger")}
          >
            {formatSignedPercent(deltaPercent)}
            <span className="sr-only">
              {improved ? " — better than the previous period" : " — worse than the previous period"}
            </span>
          </span>
        ) : null}
        {hint ? <span className="text-fg-subtle">{hint}</span> : null}
      </div>
    </div>
  );
}
