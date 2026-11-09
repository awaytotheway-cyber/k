import { describe, expect, it } from "vitest";

import { API_KEY_PREFIX, generateApiKey, hashApiKey, keyDisplayPrefix } from "@/lib/api-keys";

describe("generateApiKey", () => {
  it("produces a recognisable, pasteable key", () => {
    const { plaintext } = generateApiKey();
    expect(plaintext.startsWith(API_KEY_PREFIX)).toBe(true);
    // No characters that break a shell command or a copy-paste.
    expect(plaintext).toMatch(/^[A-Za-z0-9_]+$/);
  });

  it("is long enough not to be guessable", () => {
    const { plaintext } = generateApiKey();
    const entropyPart = plaintext.slice(API_KEY_PREFIX.length);
    expect(entropyPart.length).toBeGreaterThanOrEqual(32);
  });

  it("never repeats", () => {
    const keys = new Set(Array.from({ length: 500 }, () => generateApiKey().plaintext));
    expect(keys.size).toBe(500);
  });

  it("returns the hash and display prefix alongside the plaintext", () => {
    const { plaintext, hashedKey, prefix } = generateApiKey();
    expect(hashedKey).toBe(hashApiKey(plaintext));
    expect(prefix).toBe(keyDisplayPrefix(plaintext));
  });
});

describe("hashApiKey", () => {
  it("is deterministic", () => {
    expect(hashApiKey("tr_live_abc")).toBe(hashApiKey("tr_live_abc"));
  });

  it("separates different keys", () => {
    expect(hashApiKey("tr_live_abc")).not.toBe(hashApiKey("tr_live_abd"));
  });

  it("does not leak the key", () => {
    const plaintext = "tr_live_supersecretvalue";
    const hashed = hashApiKey(plaintext);
    expect(hashed).not.toContain("supersecret");
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("keyDisplayPrefix", () => {
  it("shows enough to recognise a key but not to use it", () => {
    const { plaintext, prefix } = generateApiKey();
    expect(plaintext.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(plaintext.length / 2);
  });

  it("is stable for the same key", () => {
    expect(keyDisplayPrefix("tr_live_abcdef123456")).toBe(keyDisplayPrefix("tr_live_abcdef123456"));
  });
});
