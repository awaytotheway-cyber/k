/**
 * The ad platform boundary.
 *
 * Every source of spend — a CSV upload today, the Meta Marketing API once app
 * review clears, Google Ads after that — implements this one interface. The
 * rest of the product talks to the interface and never to a platform, so
 * adding a platform is writing one file, not threading a new concept through
 * the dashboard.
 *
 * This existing is the reason the product can ship and charge before any
 * platform API access is granted: CSV satisfies the same contract that Meta
 * will, so nothing built on top of it is throwaway.
 */
import type { Platform } from "@/generated/prisma/enums";
import type { SpendCsvRow } from "@/lib/adapters/csv";

/** A day of cost for one entity in the ad hierarchy. */
export type SpendRecord = SpendCsvRow;

/** Ad metadata, for the creative text the angle tagger reads. */
export type AdRecord = {
  externalId: string;
  name: string;
  adSetExternalId: string;
  campaignExternalId: string;
  headline?: string | null;
  primaryText?: string | null;
  creativeThumbUrl?: string | null;
  status?: string | null;
};

/** A conversion we push back to the platform so its optimiser can learn. */
export type ConversionPushback = {
  eventName: string;
  occurredAt: Date;
  valueCents: number;
  currency: string;
  /** SHA-256 of the lowercased email, never the address itself. */
  hashedEmail?: string | null;
  clickId?: string | null;
  /** Shared with the browser pixel so the platform can dedupe. */
  eventId: string;
};

export type SyncWindow = { from: Date; to: Date };

export type AdPlatformAdapter = {
  readonly platform: Platform;
  /** How this adapter got its data, for display and for trust. */
  readonly source: "CSV" | "API" | "SEED";

  /** Daily cost for the window. */
  fetchSpend(window: SyncWindow): Promise<SpendRecord[]>;

  /**
   * Ad metadata. Optional because a CSV gives names but no creative text —
   * callers must cope with an adapter that cannot supply it.
   */
  fetchAds?(window: SyncWindow): Promise<AdRecord[]>;

  /**
   * Send attributed conversions back to the platform's conversions API.
   *
   * Optional, and absent for CSV: this is the step that makes the platform's
   * own optimiser better, and it is why an API adapter is worth the app review
   * that a spreadsheet upload avoids.
   */
  pushConversions?(conversions: ConversionPushback[]): Promise<{ accepted: number }>;
};
