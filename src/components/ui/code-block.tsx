"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

/**
 * Copyable code. Used for the tracking snippet and the test-conversion curl —
 * both are things people paste elsewhere, so copying must be one click and must
 * confirm it worked.
 */
export function CodeBlock({
  code,
  language,
  className,
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const blockId = `code-${language ?? "text"}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard blocked (insecure origin or denied permission): select it
      // instead so the user can copy manually.
      const selection = window.getSelection();
      const node = document.getElementById(blockId);
      if (selection && node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius)]",
        "border border-[var(--border)] bg-bg-subtle",
        className,
      )}
    >
      {language ? (
        <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5">
          <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
            {language}
          </span>
        </div>
      ) : null}

      <button
        type="button"
        onClick={copy}
        className={cn(
          "absolute right-2 z-10 rounded-md border border-[var(--border-strong)]",
          "bg-surface px-2 py-1 text-xs font-medium text-fg-muted shadow-sm",
          "transition-colors hover:text-fg",
          language ? "top-9" : "top-2",
        )}
      >
        {copied ? "Copied" : "Copy"}
      </button>

      <pre className="overflow-x-auto p-3 pr-20 text-xs leading-relaxed">
        <code id={blockId} className="font-mono text-fg">
          {code}
        </code>
      </pre>
    </div>
  );
}
