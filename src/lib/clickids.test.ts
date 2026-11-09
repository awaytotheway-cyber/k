import { describe, expect, it } from "vitest";

import { isPaidTouch, parseProvenance } from "@/lib/clickids";

const at = (url: string, referrer?: string) => parseProvenance({ url, referrer });

describe("parseProvenance — click ids", () => {
  const cases = [
    ["fbclid", "FBCLID", "META"],
    ["gclid", "GCLID", "GOOGLE"],
    ["gbraid", "GBRAID", "GOOGLE"],
    ["wbraid", "WBRAID", "GOOGLE"],
    ["ttclid", "TTCLID", "TIKTOK"],
    ["li_fat_id", "LI_FAT_ID", "LINKEDIN"],
    ["msclkid", "MSCLKID", "MICROSOFT"],
  ] as const;

  for (const [param, type, platform] of cases) {
    it(`reads ${param} as ${platform}`, () => {
      const r = at(`https://acme.com/pricing?${param}=abc123`);
      expect(r.clickId).toBe("abc123");
      expect(r.clickIdType).toBe(type);
      expect(r.platform).toBe(platform);
    });
  }

  it("is case-insensitive about the parameter name", () => {
    // Some email and link tools upper-case query keys in transit.
    expect(at("https://acme.com/?FBCLID=xyz").clickIdType).toBe("FBCLID");
    expect(at("https://acme.com/?GCLID=xyz").clickIdType).toBe("GCLID");
  });

  it("ignores an empty or whitespace click id", () => {
    expect(at("https://acme.com/?gclid=").clickIdType).toBe("NONE");
    expect(at("https://acme.com/?gclid=%20%20").clickIdType).toBe("NONE");
  });

  it("prefers the Google click id when a redirect chain leaves two behind", () => {
    // Link shorteners and redirects can carry a stale fbclid onto a Google
    // click. Deterministic precedence beats whichever the parser saw first.
    const r = at("https://acme.com/?fbclid=old&gclid=new");
    expect(r.clickIdType).toBe("GCLID");
    expect(r.clickId).toBe("new");
  });

  it("caps an absurdly long click id rather than storing it whole", () => {
    const r = at(`https://acme.com/?gclid=${"x".repeat(5000)}`);
    expect(r.clickId!.length).toBeLessThanOrEqual(512);
  });
});

describe("parseProvenance — UTMs", () => {
  it("captures all five UTM parameters", () => {
    const r = at(
      "https://acme.com/?utm_source=linkedin&utm_medium=cpc&utm_campaign=q4&utm_content=hookA&utm_term=attribution",
    );
    expect(r.utm).toEqual({
      source: "linkedin",
      medium: "cpc",
      campaign: "q4",
      content: "hookA",
      term: "attribution",
    });
  });

  it("infers the platform from a paid UTM when no click id survived", () => {
    // iOS and privacy extensions strip click ids but usually leave UTMs.
    const r = at("https://acme.com/?utm_source=facebook&utm_medium=cpc");
    expect(r.platform).toBe("META");
    expect(r.clickIdType).toBe("NONE");
  });

  it("recognises the common spellings of each ad platform", () => {
    expect(at("https://a.com/?utm_source=fb&utm_medium=paid").platform).toBe("META");
    expect(at("https://a.com/?utm_source=meta&utm_medium=cpc").platform).toBe("META");
    expect(at("https://a.com/?utm_source=instagram&utm_medium=cpc").platform).toBe("META");
    expect(at("https://a.com/?utm_source=adwords&utm_medium=cpc").platform).toBe("GOOGLE");
    expect(at("https://a.com/?utm_source=bing&utm_medium=cpc").platform).toBe("MICROSOFT");
    expect(at("https://a.com/?utm_source=tiktok&utm_medium=paid_social").platform).toBe("TIKTOK");
  });

  it("does not call an unpaid medium paid just because the source is an ad network", () => {
    // An organic LinkedIn post is not LinkedIn Ads spend.
    const r = at("https://acme.com/?utm_source=linkedin&utm_medium=social");
    expect(r.platform).not.toBe("LINKEDIN");
  });

  it("treats utm_medium=email as email", () => {
    expect(at("https://acme.com/?utm_source=newsletter&utm_medium=email").platform).toBe("EMAIL");
  });
});

describe("parseProvenance — referrer fallback", () => {
  it("calls a search engine referrer organic", () => {
    expect(at("https://acme.com/blog", "https://www.google.com/").platform).toBe("ORGANIC");
    expect(at("https://acme.com/blog", "https://duckduckgo.com/").platform).toBe("ORGANIC");
    expect(at("https://acme.com/blog", "https://www.bing.com/search?q=x").platform).toBe("ORGANIC");
  });

  it("calls another site a referral", () => {
    expect(at("https://acme.com/", "https://news.ycombinator.com/").platform).toBe("REFERRAL");
  });

  it("calls no referrer direct", () => {
    expect(at("https://acme.com/").platform).toBe("DIRECT");
    expect(at("https://acme.com/", "").platform).toBe("DIRECT");
  });

  it("does not count our own site as a referral", () => {
    // Internal navigation is the same visit, not a new source.
    expect(at("https://acme.com/pricing", "https://acme.com/").platform).toBe("DIRECT");
  });
});

describe("parseProvenance — robustness", () => {
  it("does not throw on a malformed URL", () => {
    const r = parseProvenance({ url: "not a url at all" });
    expect(r.platform).toBe("DIRECT");
    expect(r.clickIdType).toBe("NONE");
  });

  it("does not throw on a malformed referrer", () => {
    expect(() => at("https://acme.com/", ":::::")).not.toThrow();
  });

  it("keeps the landing URL but drops nothing it was given", () => {
    const r = at("https://acme.com/pricing?gclid=abc&utm_source=google&utm_medium=cpc");
    expect(r.clickId).toBe("abc");
    expect(r.utm.source).toBe("google");
  });
});

describe("isPaidTouch", () => {
  it("counts a touch with a click id", () => {
    expect(isPaidTouch(at("https://acme.com/?gclid=x"))).toBe(true);
  });

  it("counts a paid-medium UTM touch with no click id", () => {
    expect(isPaidTouch(at("https://acme.com/?utm_source=facebook&utm_medium=cpc"))).toBe(true);
  });

  it("does not count organic, direct, referral or email", () => {
    expect(isPaidTouch(at("https://acme.com/", "https://www.google.com/"))).toBe(false);
    expect(isPaidTouch(at("https://acme.com/"))).toBe(false);
    expect(isPaidTouch(at("https://acme.com/", "https://news.ycombinator.com/"))).toBe(false);
    expect(isPaidTouch(at("https://acme.com/?utm_medium=email&utm_source=n"))).toBe(false);
  });
});
