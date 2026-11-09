/**
 * Theme preference.
 *
 * Stored in a plain (non-httpOnly) cookie so that the server can render the
 * right class on <html> and the client can flip it without a round trip. It is
 * a display preference, not a credential.
 *
 * No cookie means "follow the operating system", which globals.css handles with
 * a prefers-color-scheme fallback. That is why the server renders no class at
 * all in that case, rather than guessing light.
 */
export const THEME_COOKIE = "theme";

export type Theme = "light" | "dark";

export function isTheme(value: string | undefined): value is Theme {
  return value === "light" || value === "dark";
}

/** The class for <html>, or undefined to follow the OS. */
export function themeClass(cookieValue: string | undefined): Theme | undefined {
  return isTheme(cookieValue) ? cookieValue : undefined;
}
