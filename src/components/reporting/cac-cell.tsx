import { Badge } from "@/components/ui/badge";
import { formatCacRange, formatCents, verdictLabel } from "@/lib/format";
import type { CacEstimate } from "@/lib/stats/confidence";

/**
 * Cost per acquisition with its credible interval and a verdict.
 *
 * The whole reason this component exists instead of a bare number: a CAC of
 * $310 on two conversions and a CAC of $310 on two hundred are the same figure
 * and completely different facts. The interval and the sample size are shown
 * next to the number, not buried in a tooltip, so nobody kills a winning ad on
 * three conversions.
 */
export function CacCell({
  estimate,
  currency,
  compact = false,
}: {
  estimate: CacEstimate;
  currency: string;
  compact?: boolean;
}) {
  const verdict = verdictLabel(estimate.verdict);

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="tabular text-sm font-medium text-fg">
          {formatCents(estimate.pointCents, { currency })}
        </span>
        <Badge tone={verdict.tone} title={verdict.hint}>
          {verdict.text}
        </Badge>
      </div>

      {!compact ? (
        <p className="tabular mt-0.5 text-xs text-fg-subtle">
          95% CI {formatCacRange(estimate, { currency })} · n={estimate.conversions}
        </p>
      ) : null}

      {estimate.conversionsNeeded !== null ? (
        <p className="mt-0.5 text-xs text-warning">
          ~{estimate.conversionsNeeded} more conversions to call it
        </p>
      ) : null}
    </div>
  );
}
