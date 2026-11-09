import Link from "next/link";

import { cn } from "@/lib/cn";
import { MODEL_LABELS, RANGE_PRESETS, type RangeKey } from "@/lib/reporting/range";
import type { AttributionModel } from "@/generated/prisma/enums";

/**
 * Date range and attribution model, as links rather than client state.
 *
 * Filters live in the URL so a view can be bookmarked, shared with a colleague
 * and reloaded, and so the whole page stays a server component.
 */
export function FilterBar({
  basePath,
  params,
  range,
  model,
  showModel = true,
  children,
}: {
  basePath: string;
  /** Current search params, so switching one filter preserves the others. */
  params: Record<string, string | undefined>;
  range: RangeKey;
  model: AttributionModel;
  showModel?: boolean;
  children?: React.ReactNode;
}) {
  function hrefWith(changes: Record<string, string>) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...changes })) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented label="Date range">
        {(Object.keys(RANGE_PRESETS) as RangeKey[]).map((key) => (
          <SegmentLink
            key={key}
            href={hrefWith({ range: key, page: "" })}
            active={key === range}
          >
            {RANGE_PRESETS[key].label.replace("Last ", "")}
          </SegmentLink>
        ))}
      </Segmented>

      {showModel ? (
        <label className="flex items-center gap-1.5 text-xs text-fg-muted">
          <span className="hidden sm:inline">Model</span>
          <Segmented label="Attribution model">
            {(Object.keys(MODEL_LABELS) as AttributionModel[]).map((key) => (
              <SegmentLink
                key={key}
                href={hrefWith({ model: key, page: "" })}
                active={key === model}
                title={MODEL_LABELS[key]}
              >
                {SHORT_MODEL[key]}
              </SegmentLink>
            ))}
          </Segmented>
        </label>
      ) : null}

      {children}
    </div>
  );
}

const SHORT_MODEL: Record<AttributionModel, string> = {
  LAST_CLICK: "Last",
  FIRST_CLICK: "First",
  LINEAR: "Linear",
  TIME_DECAY: "Decay",
  POSITION_BASED: "40/20/40",
};

function Segmented({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-md border border-[var(--border)] bg-surface"
    >
      {children}
    </div>
  );
}

function SegmentLink({
  href,
  active,
  title,
  children,
}: {
  href: string;
  active: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={active ? "true" : undefined}
      className={cn(
        "px-2.5 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-fg" : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}
