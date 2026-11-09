"use client";

import { cn } from "@/lib/cn";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Light/dark toggle.
 *
 * Holds no React state: the current theme is whatever <html> says, the icons
 * are swapped by CSS, and the handler reads the live state at click time. That
 * avoids a hydration mismatch and the mirror-the-DOM-into-state effect such a
 * mismatch usually forces.
 */
export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;

    // With no class present the page is following the OS, so read that to
    // decide what "the opposite" means.
    const current: Theme = root.classList.contains("dark")
      ? "dark"
      : root.classList.contains("light")
        ? "light"
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    const next: Theme = current === "dark" ? "light" : "dark";

    root.classList.remove("light", "dark");
    root.classList.add(next);

    // Readable by the server on the next render, so the choice survives a reload.
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md",
        "text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg",
        className,
      )}
    >
      {/* Moon in light mode, sun in dark mode — chosen by CSS, not state. */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="size-4 dark:hidden"
        aria-hidden="true"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="hidden size-4 dark:block"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </svg>
    </button>
  );
}
