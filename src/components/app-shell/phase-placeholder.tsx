import { EmptyState } from "@/components/ui/empty-state";
import { NavIcon } from "@/components/app-shell/icons";
import type { IconName } from "@/lib/nav";

/**
 * Honest placeholder for a page whose build phase hasn't landed.
 *
 * It says what the page will do and what it needs from the user, so a half-built
 * product reads as a roadmap rather than a broken link.
 */
export function PhasePlaceholder({
  icon,
  title,
  description,
  willShow,
}: {
  icon: IconName;
  title: string;
  description: string;
  willShow: string[];
}) {
  return (
    <EmptyState
      icon={<NavIcon name={icon} className="size-5" />}
      title={title}
      description={description}
      hint={
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-surface px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            What lands here
          </p>
          <ul className="mt-2 space-y-1.5">
            {willShow.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-fg-muted">
                <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      }
    />
  );
}
