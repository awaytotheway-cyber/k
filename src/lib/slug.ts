/**
 * URL-safe slug helpers.
 *
 * Workspace slugs appear in every app URL, so they must be stable, readable,
 * and unique. `uniqueSlug` appends a short random suffix only when the base is
 * already taken, keeping the common case clean (`acme` not `acme-x7f2`).
 */

const RESERVED = new Set([
  "api",
  "app",
  "admin",
  "login",
  "logout",
  "signup",
  "settings",
  "billing",
  "pricing",
  "dashboard",
  "new",
  "r",
  "_next",
  "static",
  "public",
]);

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base.length >= 2 ? base : "workspace";
}

function suffix(length = 4): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"; // no look-alikes
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Produce a slug not already in use.
 *
 * @param name     human-readable source, e.g. a company name
 * @param isTaken  async existence check against the database
 */
export async function uniqueSlug(
  name: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name);
  const candidates = RESERVED.has(base) ? [] : [base];

  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = candidates.shift() ?? `${base}-${suffix()}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // Astronomically unlikely; keeps the signature non-nullable.
  return `${base}-${suffix(8)}`;
}

/** Derive a sensible default workspace name from an email address. */
export function workspaceNameFromEmail(email: string): string {
  const domain = email.split("@")[1] ?? "";
  const host = domain.split(".")[0] ?? "";
  const generic = new Set([
    "gmail",
    "googlemail",
    "yahoo",
    "hotmail",
    "outlook",
    "live",
    "icloud",
    "proton",
    "protonmail",
    "aol",
    "me",
    "msn",
  ]);
  if (!host || generic.has(host)) return "My workspace";
  return host.charAt(0).toUpperCase() + host.slice(1);
}
