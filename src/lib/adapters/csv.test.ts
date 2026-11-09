import { describe, expect, it } from "vitest";

import {
  detectColumns,
  parseCsv,
  parseDateCell,
  parseIntegerCell,
  parseMoneyCents,
  parseSpendCsv,
} from "@/lib/adapters/csv";

describe("parseCsv", () => {
  it("parses a simple file", () => {
    expect(parseCsv("a,b\n1,2\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("handles quoted fields containing commas", () => {
    // Campaign names routinely contain commas.
    expect(parseCsv('name,spend\n"Prospecting, US",100')).toEqual([
      ["name", "spend"],
      ["Prospecting, US", "100"],
    ]);
  });

  it("handles escaped quotes", () => {
    expect(parseCsv('name\n"He said ""hi"""')).toEqual([["name"], ['He said "hi"']]);
  });

  it("handles newlines inside quoted fields", () => {
    expect(parseCsv('name,x\n"line one\nline two",5')).toEqual([
      ["name", "x"],
      ["line one\nline two", "5"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a UTF-8 BOM", () => {
    // Excel adds one, and it otherwise corrupts the first header name.
    expect(parseCsv("﻿Date,Cost\n2026-01-01,5")[0]![0]).toBe("Date");
  });

  it("ignores trailing blank lines", () => {
    expect(parseCsv("a\n1\n\n\n")).toEqual([["a"], ["1"]]);
  });

  it("keeps empty fields", () => {
    expect(parseCsv("a,b,c\n1,,3")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("supports semicolon-delimited exports", () => {
    // European locale exports use semicolons.
    expect(parseCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("supports tab-delimited exports", () => {
    expect(parseCsv("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseMoneyCents", () => {
  it("parses plain numbers", () => {
    expect(parseMoneyCents("1234.56")).toBe(123_456);
    expect(parseMoneyCents("100")).toBe(10_000);
    expect(parseMoneyCents("0")).toBe(0);
  });

  it("strips currency symbols and spaces", () => {
    expect(parseMoneyCents("$1,234.56")).toBe(123_456);
    expect(parseMoneyCents("£99.00")).toBe(9_900);
    expect(parseMoneyCents(" 1 234.50 ")).toBe(123_450);
  });

  it("handles US thousands separators", () => {
    expect(parseMoneyCents("1,234,567.89")).toBe(123_456_789);
  });

  it("handles European decimal commas", () => {
    // "1.234,56" is one thousand two hundred and thirty four euros.
    expect(parseMoneyCents("1.234,56")).toBe(123_456);
    expect(parseMoneyCents("99,50")).toBe(9_950);
  });

  it("does not mistake a US thousands comma for a decimal", () => {
    // "1,234" is 1234 dollars, not 1 dollar 23.
    expect(parseMoneyCents("1,234")).toBe(123_400);
  });

  it("rounds to the nearest cent", () => {
    expect(parseMoneyCents("10.005")).toBe(1_001);
    expect(parseMoneyCents("10.004")).toBe(1_000);
  });

  it("rejects anything that is not a number", () => {
    expect(parseMoneyCents("")).toBeNull();
    expect(parseMoneyCents("n/a")).toBeNull();
    expect(parseMoneyCents("--")).toBeNull();
  });

  it("rejects negative spend rather than silently flipping it", () => {
    // A negative in a spend column means the export is wrong, not that money
    // came back. Flag it instead of corrupting the totals.
    expect(parseMoneyCents("-50")).toBeNull();
  });
});

describe("parseIntegerCell", () => {
  it("parses counts with separators", () => {
    expect(parseIntegerCell("1,234")).toBe(1234);
    expect(parseIntegerCell("0")).toBe(0);
    expect(parseIntegerCell(" 42 ")).toBe(42);
  });

  it("treats a dash or empty as zero, as ad platforms export them", () => {
    expect(parseIntegerCell("—")).toBe(0);
    expect(parseIntegerCell("-")).toBe(0);
    expect(parseIntegerCell("")).toBe(0);
  });

  it("truncates a decimal count", () => {
    expect(parseIntegerCell("12.0")).toBe(12);
  });

  it("returns null for nonsense", () => {
    expect(parseIntegerCell("many")).toBeNull();
  });
});

describe("parseDateCell", () => {
  it("parses ISO dates", () => {
    expect(parseDateCell("2026-11-09")?.toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });

  it("parses US slash dates", () => {
    expect(parseDateCell("11/09/2026")?.toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });

  it("parses written months", () => {
    expect(parseDateCell("9 Nov 2026")?.toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(parseDateCell("Nov 9, 2026")?.toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });

  it("always lands on UTC midnight, never a local-time offset", () => {
    // Otherwise a day's spend can drift into the neighbouring day.
    const d = parseDateCell("2026-03-15")!;
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
  });

  it("rejects unparseable values", () => {
    expect(parseDateCell("")).toBeNull();
    expect(parseDateCell("last tuesday")).toBeNull();
    expect(parseDateCell("2026-13-45")).toBeNull();
  });
});

describe("detectColumns", () => {
  it("recognises a Meta Ads export", () => {
    const headers = [
      "Reporting starts",
      "Campaign name",
      "Ad set name",
      "Ad name",
      "Amount spent (USD)",
      "Impressions",
      "Link clicks",
    ];
    expect(detectColumns(headers)).toMatchObject({
      date: 0,
      campaign: 1,
      adSet: 2,
      ad: 3,
      spend: 4,
      impressions: 5,
      clicks: 6,
    });
  });

  it("recognises a Google Ads export", () => {
    const headers = ["Day", "Campaign", "Ad group", "Cost", "Impr.", "Clicks"];
    expect(detectColumns(headers)).toMatchObject({
      date: 0,
      campaign: 1,
      adSet: 2,
      spend: 3,
      impressions: 4,
      clicks: 5,
    });
  });

  it("is case and whitespace insensitive", () => {
    expect(detectColumns(["  DATE  ", "campaign NAME", "SPEND"])).toMatchObject({
      date: 0,
      campaign: 1,
      spend: 2,
    });
  });

  it("reports what it could not find", () => {
    const result = detectColumns(["Something", "Else"]);
    expect(result.date).toBeNull();
    expect(result.spend).toBeNull();
  });
});

describe("parseSpendCsv", () => {
  const good = [
    "Date,Campaign name,Ad set name,Ad name,Amount spent (USD),Impressions,Link clicks",
    "2026-11-01,Prospecting,Lookalike,ROI calc,\"$1,234.56\",10000,250",
    "2026-11-02,Prospecting,Lookalike,ROI calc,$980.00,8000,190",
  ].join("\n");

  it("parses a well-formed file", () => {
    const result = parseSpendCsv(good);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      campaignName: "Prospecting",
      adSetName: "Lookalike",
      adName: "ROI calc",
      spendCents: 123_456,
      impressions: 10_000,
      clicks: 250,
    });
    expect(result.rows[0]!.date.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("reports the row number of a bad value and keeps the rest", () => {
    // One broken row must not cost the user the whole import.
    const withBad = good + "\n2026-11-03,Prospecting,Lookalike,ROI calc,oops,100,5";
    const result = parseSpendCsv(withBad);
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.row).toBe(4); // 1-based, including the header
    expect(result.errors[0]!.message).toMatch(/spend/i);
  });

  it("fails loudly when required columns are missing", () => {
    const result = parseSpendCsv("Foo,Bar\n1,2");
    expect(result.rows).toEqual([]);
    expect(result.errors[0]!.message).toMatch(/date|spend/i);
  });

  it("rejects an empty file", () => {
    expect(parseSpendCsv("").errors.length).toBeGreaterThan(0);
  });

  it("tolerates a missing ad column, falling back to campaign level", () => {
    const campaignOnly = ["Day,Campaign,Cost", "2026-11-01,Brand,500"].join("\n");
    const result = parseSpendCsv(campaignOnly);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      campaignName: "Brand",
      adName: null,
      adSetName: null,
      spendCents: 50_000,
      level: "CAMPAIGN",
    });
  });

  it("marks ad-level rows as AD level", () => {
    expect(parseSpendCsv(good).rows[0]!.level).toBe("AD");
  });

  it("skips rows that are entirely blank", () => {
    const withBlank = good + "\n,,,,,,";
    const result = parseSpendCsv(withBlank);
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toEqual([]);
  });

  it("caps how many rows it will accept", () => {
    const header = "Date,Campaign,Cost\n";
    const rows = Array.from({ length: 60_000 }, (_, i) => `2026-11-01,C${i},10`).join("\n");
    const result = parseSpendCsv(header + rows);
    expect(result.errors.some((e) => /too many rows/i.test(e.message))).toBe(true);
  });
});
