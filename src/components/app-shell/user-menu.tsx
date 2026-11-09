"use client";

import { useEffect, useRef, useState } from "react";

import { logoutAction } from "@/lib/actions/auth-actions";
import { cn } from "@/lib/cn";

export function UserMenu({ email, name }: { email: string; name: string | null }) {
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

  const label = name || email;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5",
          "text-left transition-colors hover:bg-bg-subtle",
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-border-strong text-[11px] font-semibold text-fg"
        >
          {label[0]?.toUpperCase() ?? "?"}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{label}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute bottom-full left-0 right-0 z-50 mb-1 overflow-hidden",
            "rounded-[var(--radius)] border border-[var(--border)] bg-surface-raised shadow-lg",
          )}
        >
          <div className="border-b border-[var(--border)] px-3 py-2">
            <p className="truncate text-xs text-fg-subtle">Signed in as</p>
            <p className="truncate text-sm text-fg">{email}</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className="w-full px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-bg-subtle"
            >
              Log out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
