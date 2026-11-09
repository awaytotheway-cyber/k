"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

export type WorkspaceOption = { id: string; slug: string; name: string; isDemo: boolean };

/**
 * Workspace picker. One workspace for a solo SaaS, many for an agency, so the
 * control collapses to a plain label when there is nothing to switch to.
 */
export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: WorkspaceOption;
  workspaces: WorkspaceOption[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const hasOthers = workspaces.length > 1;

  if (!hasOthers) {
    return (
      <div className="flex min-w-0 items-center gap-2 px-2 py-1.5">
        <WorkspaceAvatar name={current.name} />
        <span className="truncate text-sm font-medium text-fg">{current.name}</span>
        {current.isDemo ? <Badge tone="primary">Demo</Badge> : null}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5",
          "text-left transition-colors hover:bg-bg-subtle",
        )}
      >
        <WorkspaceAvatar name={current.name} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
          {current.name}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="size-3.5 shrink-0 text-fg-subtle"
          aria-hidden="true"
        >
          <path d="m7 9 5 5 5-5" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden",
            "rounded-[var(--radius)] border border-[var(--border)] bg-surface-raised shadow-lg",
          )}
        >
          <ul className="max-h-72 overflow-y-auto py-1">
            {workspaces.map((ws) => (
              <li key={ws.id}>
                <Link
                  href={`/app/${ws.slug}`}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-2 text-sm transition-colors",
                    ws.slug === current.slug
                      ? "bg-primary-subtle text-primary"
                      : "text-fg hover:bg-bg-subtle",
                  )}
                >
                  <WorkspaceAvatar name={ws.name} />
                  <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                  {ws.isDemo ? <Badge tone="primary">Demo</Badge> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded",
        "bg-primary text-[11px] font-semibold text-primary-fg",
      )}
    >
      {initials || "W"}
    </span>
  );
}
