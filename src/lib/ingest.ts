/**
 * Shared helpers for the tracking ingest path.
 *
 * Privacy posture, deliberately: we store a salted hash of the IP address and
 * never the address itself, we do not fingerprint, and we keep only a coarse
 * device class rather than the user-agent string. Rotating IP_HASH_SALT breaks
 * the link between old and new hashes on purpose.
 */
import { createHash } from "node:crypto";

import { z } from "zod";

import type { DeviceType } from "@/generated/prisma/enums";
import { env, features } from "@/lib/env";

/**
 * Page-view payload.
 *
 * Only three fields are load-bearing: which workspace, which visitor, which
 * URL. Everything else is metadata and uses `.catch(null)` so a malformed
 * value degrades that one field instead of discarding the whole page view.
 *
 * The asymmetry is deliberate. A dropped event permanently loses the link
 * between an ad and a customer, and it fails silently — the exact failure mode
 * the Tracking Health page exists to catch. A short session id is not worth it.
 */
export const collectPayloadSchema = z.object({
  /** Workspace pixel key. Public by design: it only names a destination. */
  k: z.string().min(10).max(64),
  /** Visitor id from the first-party cookie. */
  v: z.string().min(8).max(128),
  /** Landing URL. */
  u: z.string().min(1).max(4096),

  /** Referrer, if the browser sent one. */
  r: z.string().max(4096).nullish().catch(null),
  /** Session id. Any non-empty string a client cares to use. */
  s: z.string().max(128).nullish().catch(null),
  /** Client timestamp, trusted only within a day of our own clock. */
  t: z.string().max(40).nullish().catch(null),
  /** Screen width. Advisory only. */
  w: z.number().int().positive().max(20_000).nullish().catch(null),
});

export type CollectPayload = z.infer<typeof collectPayloadSchema>;

/** Permissive CORS: the snippet runs on each customer's own domain. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** Largest ingest body we will read. Generous for a URL, hostile to abuse. */
export const MAX_BODY_BYTES = 8_192;

/**
 * Salted hash of the caller's IP, or null when no salt is configured.
 *
 * Returning null rather than hashing with an empty salt is the point: an
 * unsalted hash of an IPv4 address is trivially reversible, so we would rather
 * store nothing.
 */
export function hashIp(request: Request): string | null {
  if (!features.ipHashing) return null;

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim();
  if (!ip) return null;

  return createHash("sha256").update(`${env.IP_HASH_SALT}:${ip}`).digest("hex").slice(0, 40);
}

/** Coarse device class. Enough to segment a report, useless for identifying. */
export function deviceTypeFrom(userAgent: string | null): DeviceType {
  if (!userAgent) return "UNKNOWN";
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk|kindle/.test(ua)) return "TABLET";
  if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(ua)) return "MOBILE";
  if (/android/.test(ua)) return "TABLET";
  if (/mozilla|chrome|safari|firefox|edge|opera/.test(ua)) return "DESKTOP";
  return "UNKNOWN";
}

/** Two-letter country from whatever the host's edge put in the headers. */
export function countryFrom(request: Request): string | null {
  const value =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-country-code");
  if (!value) return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/**
 * Read a JSON body sent as text/plain.
 *
 * The snippet uses text/plain so the request stays a CORS "simple request"
 * and skips the preflight round trip on the customer's critical path.
 */
export async function readJsonBody<T>(request: Request): Promise<T | null> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) return null;

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 204 with CORS. The snippet ignores the body, so there is no point sending one. */
export function noContent(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Timestamps come from the visitor's browser, whose clock may be wrong by
 * years. Accept a small amount of skew and otherwise trust our own clock.
 */
export function safeTimestamp(value: unknown, now: Date = new Date()): Date {
  if (typeof value !== "string") return now;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return now;

  const skewMs = Math.abs(parsed.getTime() - now.getTime());
  // More than a day out means the device clock is wrong, not that the event is old.
  return skewMs > 86_400_000 ? now : parsed;
}
