import type { IconName } from "@/lib/nav";

const PATHS: Record<IconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
    </>
  ),
  ads: (
    <>
      <path d="M4 20v-7M10 20V8M16 20v-4M22 20V4" />
    </>
  ),
  conversions: (
    <>
      <path d="M3 7h12M3 12h8M3 17h5" />
      <path d="M15 15l3 3 4-5" />
    </>
  ),
  insights: (
    <>
      <path d="M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3Z" />
      <path d="M10 20h4" />
    </>
  ),
  chat: (
    <>
      <path d="M21 12a8 8 0 1 1-3.1-6.3" />
      <path d="M21 4v5h-5" />
      <path d="M8.5 11.5h7M8.5 15h4" />
    </>
  ),
  angles: (
    <>
      <path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.3 9.4l6.1-.8L12 3Z" />
    </>
  ),
  health: (
    <>
      <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
    </>
  ),
  reports: (
    <>
      <path d="M8 3h8l4 4v14H4V3h4Z" />
      <path d="M8 13h8M8 17h5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
};

export function NavIcon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
