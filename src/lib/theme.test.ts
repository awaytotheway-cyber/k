import { describe, expect, it } from "vitest";

import { isTheme, themeClass } from "@/lib/theme";

describe("isTheme", () => {
  it("accepts the two valid values", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme("")).toBe(false);
    expect(isTheme("DARK")).toBe(false);
    expect(isTheme("system")).toBe(false);
  });
});

describe("themeClass", () => {
  it("returns the explicit choice", () => {
    expect(themeClass("dark")).toBe("dark");
    expect(themeClass("light")).toBe("light");
  });

  it("returns undefined with no cookie, so CSS follows the OS", () => {
    // Important: must not default to "light", or an OS-dark user would get a
    // flash of light on every first visit.
    expect(themeClass(undefined)).toBeUndefined();
  });

  it("ignores a tampered cookie value rather than trusting it as a class", () => {
    expect(themeClass("dark; --evil")).toBeUndefined();
    expect(themeClass("../../etc")).toBeUndefined();
  });
});
