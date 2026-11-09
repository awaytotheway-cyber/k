/**
 * Sidebar navigation.
 *
 * Ordered by how often someone opens it on a working day: the numbers first,
 * then the AI layer, then trust and reporting, then setup. `phase` marks what
 * is not built yet so the shell can label it honestly instead of 404ing.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Build phase that fills this page in. Used to show a "coming next" marker. */
  phase: 1 | 2 | 3;
  group: "measure" | "decide" | "trust" | "setup";
};

export type IconName =
  | "dashboard"
  | "ads"
  | "conversions"
  | "insights"
  | "chat"
  | "angles"
  | "health"
  | "reports"
  | "settings";

export const NAV: NavItem[] = [
  { href: "", label: "Dashboard", icon: "dashboard", phase: 1, group: "measure" },
  { href: "/ads", label: "Ads", icon: "ads", phase: 1, group: "measure" },
  { href: "/conversions", label: "Conversions", icon: "conversions", phase: 1, group: "measure" },
  { href: "/insights", label: "Daily brief", icon: "insights", phase: 2, group: "decide" },
  { href: "/chat", label: "Ask your data", icon: "chat", phase: 2, group: "decide" },
  { href: "/angles", label: "Winning angles", icon: "angles", phase: 3, group: "decide" },
  { href: "/health", label: "Tracking health", icon: "health", phase: 2, group: "trust" },
  { href: "/reports", label: "Client reports", icon: "reports", phase: 3, group: "trust" },
  { href: "/settings", label: "Settings", icon: "settings", phase: 1, group: "setup" },
];

export const GROUP_LABELS: Record<NavItem["group"], string> = {
  measure: "Measure",
  decide: "Decide",
  trust: "Trust",
  setup: "Setup",
};

export function workspaceHref(slug: string, item: NavItem): string {
  return `/app/${slug}${item.href}`;
}
