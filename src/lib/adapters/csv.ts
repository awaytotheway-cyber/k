/**
 * CSV spend import.
 *
 * This is how cost gets into the product before any ad platform API is
 * connected — and for agencies who live in spreadsheets, possibly forever.
 * It has to cope with whatever Meta, Google and Excel actually emit, which is
 * why the parsing is hand-written and heavily tested rather than regex-sliced.
 *
 * The governing rule: one bad row must never cost the user the whole import.
 * Rows are parsed independently and failures are reported with their line
 * number, so a 900-row export with three typos imports 897 rows and names the
 * three.
 *
 * Pure. No database, no clock.
 */
import type { SpendLevel } from "@/generated/prisma/enums";

export type SpendCsvRow = {
  date: Date;
  campaignName: string;
  adSetName: string | null;
  adName: string | null;
  spendCents: number;
  impressions: number;
  clicks: number;
  level: SpendLevel;
};

export type CsvError = { row: number; message: string };

export type ParsedSpendCsv = {
  rows: SpendCsvRow[];
  errors: CsvError[];
  /** Which column each field was read from, for the preview UI. */
  columns: DetectedColumns;
};

/** Refuse anything larger rather than melting the server on a bad paste. */
const MAX_ROWS = 50_000;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Parse CSV/TSV text into rows of cells.
 *
 * RFC 4180 quoting, plus the delimiters real exports use: comma, semicolon
 * (European locales) and tab.
 */
export function parseCsv(text: string): string[][] {
  // Excel writes a BOM, which otherwise corrupts the first header name.
  const input = text.replace(/^﻿/, "");
  if (input.trim().length === 0) return [];

  const delimiter = detectDelimiter(input);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      // Swallow the \n of a \r\n pair.
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop trailing blank lines, which almost every export has.
  while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c.trim() === "")) {
    rows.pop();
  }

  return rows;
}

/** Pick the delimiter that appears most often on the header line. */
function detectDelimiter(input: string): string {
  const firstLine = input.split(/\r?\n/, 1)[0] ?? "";
  const counts: Array<[string, number]> = [
    [",", (firstLine.match(/,/g) ?? []).length],
    [";", (firstLine.match(/;/g) ?? []).length],
    ["\t", (firstLine.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ",";
}

// ---------------------------------------------------------------------------
// Cell coercion
// ---------------------------------------------------------------------------

/**
 * Money to cents, coping with currency symbols and both decimal conventions.
 *
 * The ambiguous case is "1,234" — US thousands or European decimal? Treated as
 * thousands, because an ad spend export showing 1.23 would be remarkable and
 * one showing 1234 is Tuesday. Where both separators appear, the last one is
 * the decimal point, which is true in every locale.
 */
export function parseMoneyCents(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "--") return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalized: string;
  if (lastComma > -1 && lastDot > -1) {
    // Both present: whichever comes last is the decimal separator.
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = cleaned.length - lastComma - 1;
    // "99,50" is a decimal comma; "1,234" is a thousands separator.
    normalized = decimals === 2 ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;

  // A negative in a spend column means the export is wrong, not that money
  // came back. Flag it rather than corrupting the totals.
  if (value < 0) return null;

  return Math.round(value * 100);
}

/** Counts, tolerating separators and the dashes platforms use for zero. */
export function parseIntegerCell(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "—" || trimmed === "--") return 0;

  const value = Number(trimmed.replace(/[\s,]/g, ""));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.trunc(value);
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * A date cell to UTC midnight.
 *
 * Always UTC: parsing to local time lets a day's spend drift into the
 * neighbouring day for anyone east or west of the server.
 */
export function parseDateCell(raw: string): Date | null {
  const value = raw.trim();
  if (value === "") return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return utcDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  // Ad platforms export US order; an unambiguous day > 12 is handled below.
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = Number(slash[3]);
    return a > 12 ? utcDate(year, b - 1, a) : utcDate(year, a - 1, b);
  }

  const dayFirst = /^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/.exec(value);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2]!.slice(0, 3).toLowerCase()];
    if (month === undefined) return null;
    return utcDate(Number(dayFirst[3]), month, Number(dayFirst[1]));
  }

  const monthFirst = /^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(value);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1]!.slice(0, 3).toLowerCase()];
    if (month === undefined) return null;
    return utcDate(Number(monthFirst[3]), month, Number(monthFirst[2]));
  }

  return null;
}

function utcDate(year: number, monthIndex: number, day: number): Date | null {
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, monthIndex, day));
  // Rejects 31 February, which Date would roll forward into March.
  if (date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) return null;
  return date;
}

// ---------------------------------------------------------------------------
// Column detection
// ---------------------------------------------------------------------------

export type DetectedColumns = {
  date: number | null;
  campaign: number | null;
  adSet: number | null;
  ad: number | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
};

/**
 * Header aliases, as Meta, Google, TikTok and LinkedIn actually spell them.
 * Matched longest-first so "campaign name" wins over "campaign".
 */
const ALIASES: Record<keyof DetectedColumns, string[]> = {
  date: ["reporting starts", "date", "day", "date range", "report date"],
  campaign: ["campaign name", "campaign", "campaign_name"],
  adSet: ["ad set name", "ad group name", "adgroup name", "ad set", "ad group", "adset"],
  ad: ["ad name", "creative name", "ad", "creative"],
  spend: [
    "amount spent (usd)",
    "amount spent",
    "total spent",
    "cost",
    "spend",
    "spent",
    "amount",
  ],
  impressions: ["impressions", "impr.", "impr", "views"],
  clicks: ["link clicks", "clicks (all)", "clicks", "link click"],
};

export function detectColumns(headers: string[]): DetectedColumns {
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const taken = new Set<number>();

  const result: DetectedColumns = {
    date: null,
    campaign: null,
    adSet: null,
    ad: null,
    spend: null,
    impressions: null,
    clicks: null,
  };

  // Most specific fields first, so "ad set name" is claimed before "ad".
  const order: Array<keyof DetectedColumns> = [
    "date",
    "adSet",
    "campaign",
    "spend",
    "impressions",
    "clicks",
    "ad",
  ];

  for (const field of order) {
    for (const alias of ALIASES[field]) {
      const index = normalized.findIndex((h, i) => !taken.has(i) && h === alias);
      if (index > -1) {
        result[field] = index;
        taken.add(index);
        break;
      }
    }
    if (result[field] !== null) continue;

    // Fall back to a contained match, e.g. "Amount spent (GBP)".
    for (const alias of ALIASES[field]) {
      const index = normalized.findIndex((h, i) => !taken.has(i) && h.includes(alias));
      if (index > -1) {
        result[field] = index;
        taken.add(index);
        break;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Whole-file parse
// ---------------------------------------------------------------------------

export function parseSpendCsv(text: string): ParsedSpendCsv {
  const empty: DetectedColumns = {
    date: null, campaign: null, adSet: null, ad: null,
    spend: null, impressions: null, clicks: null,
  };

  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], errors: [{ row: 0, message: "The file is empty." }], columns: empty };
  }
  if (table.length === 1) {
    return {
      rows: [],
      errors: [{ row: 0, message: "The file has a header but no data rows." }],
      columns: detectColumns(table[0]!),
    };
  }

  const columns = detectColumns(table[0]!);

  const missing: string[] = [];
  if (columns.date === null) missing.push("date");
  if (columns.spend === null) missing.push("spend or cost");
  if (columns.campaign === null) missing.push("campaign");
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: `Could not find a column for: ${missing.join(", ")}. Found: ${table[0]!.join(", ")}`,
        },
      ],
      columns,
    };
  }

  const rows: SpendCsvRow[] = [];
  const errors: CsvError[] = [];

  const dataRows = table.slice(1);
  if (dataRows.length > MAX_ROWS) {
    errors.push({
      row: 0,
      message: `Too many rows (${dataRows.length.toLocaleString()}). Split the file into chunks of ${MAX_ROWS.toLocaleString()} or fewer.`,
    });
    return { rows: [], errors, columns };
  }

  dataRows.forEach((cells, index) => {
    // 1-based, counting the header, so the number matches the spreadsheet.
    const lineNumber = index + 2;

    if (cells.every((c) => c.trim() === "")) return;

    const cell = (column: number | null): string =>
      column === null ? "" : (cells[column] ?? "").trim();

    const date = parseDateCell(cell(columns.date));
    if (!date) {
      errors.push({ row: lineNumber, message: `Could not read the date "${cell(columns.date)}".` });
      return;
    }

    const spendCents = parseMoneyCents(cell(columns.spend));
    if (spendCents === null) {
      errors.push({
        row: lineNumber,
        message: `Could not read the spend "${cell(columns.spend)}".`,
      });
      return;
    }

    const campaignName = cell(columns.campaign);
    if (campaignName === "") {
      errors.push({ row: lineNumber, message: "Campaign name is blank." });
      return;
    }

    const impressions = parseIntegerCell(cell(columns.impressions));
    const clicks = parseIntegerCell(cell(columns.clicks));
    if (impressions === null || clicks === null) {
      errors.push({ row: lineNumber, message: "Could not read impressions or clicks." });
      return;
    }

    const adName = cell(columns.ad) || null;
    const adSetName = cell(columns.adSet) || null;

    rows.push({
      date,
      campaignName,
      adSetName,
      adName,
      spendCents,
      impressions,
      clicks,
      // The most specific level the file actually names.
      level: adName ? "AD" : adSetName ? "ADSET" : "CAMPAIGN",
    });
  });

  return { rows, errors, columns };
}
