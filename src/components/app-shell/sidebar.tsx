"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { NavIcon } from "@/components/app-shell/icons";
import { UserMenu } from "@/components/app-shell/user-menu";
import {
  WorkspaceSwitcher,
  type WorkspaceOption,
} from "@/components/app-shell/workspace-switcher";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/cn";
import { GROUP_LABELS, NAV, workspaceHref, type NavItem } from "@/lib/nav";

export function Sidebar({
  workspace,
  workspaces,
  user,
}: {
  workspace: WorkspaceOption;
  workspaces: WorkspaceOption[];
  user: { email: string; name: string | null };
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const groups = (["measure", "decide", "trust", "setup"] as const).map((group) => ({
    group,
    items: NAV.filter((item) => item.group === group),
  }));

  function isActive(item: NavItem) {
    const href = workspaceHref(workspace.slug, item);
    // The dashboard lives at the workspace root, so it must match exactly or it
    // would highlight for every child route.
    return item.href === "" ? pathname === href : pathname.startsWith(href);
  }

  const nav = (
    <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Workspace sections">
      {groups.map(({ group, items }) => (
        <div key={group} className="mb-4">
          <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            {GROUP_LABELS[group]}
          </p>
          <ul className="space-y-0.5">
            {items.map((item) => {
              const active = isActive(item);
              return (
                <li key={item.label}>
                  <Link
                    href={workspaceHref(workspace.slug, item)}
                    aria-current={active ? "page" : undefined}
                    // Closed here rather than in an effect on pathname: the
                    // drawer must not stay over the page it just opened.
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                      active
                        ? "bg-primary-subtle font-medium text-primary"
                        : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
                    )}
                  >
                    <NavIcon name={item.icon} className="size-4 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.phase > 1 ? (
                      <span
                        className="text-[10px] font-medium text-fg-subtle"
                        title={`Arrives in phase ${item.phase}`}
                      >
                        soon
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-surface px-3 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          className="inline-flex size-9 items-center justify-center rounded-md text-fg-muted hover:bg-bg-subtle"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="size-5"
            aria-hidden="true"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Logo />
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[17rem] flex-col border-r border-[var(--border)] bg-surface">
            <div className="border-b border-[var(--border)] p-2">
              <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
            </div>
            {nav}
            <div className="border-t border-[var(--border)] p-2">
              <UserMenu email={user.email} name={user.name} />
            </div>
          </aside>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="hidden w-[16rem] shrink-0 flex-col border-r border-[var(--border)] bg-surface lg:flex">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-3">
          <Link href="/" className="rounded-md">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <div className="border-b border-[var(--border)] p-2">
          <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
        </div>
        {nav}
        <div className="border-t border-[var(--border)] p-2">
          <UserMenu email={user.email} name={user.name} />
        </div>
      </aside>
    </>
  );
}
