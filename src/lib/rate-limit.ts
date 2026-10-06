/**
 * rate-limit.ts — the policy layer over lib/repos/rate-limit.
 *
 * Limits live in our own database rather than a third-party service, so they
 * hold across serverless instances without anything to sign up for or pay for.
 *
 * Identity is the signed-in user where we have one, falling back to the client
 * IP. The counter is generous on purpose: a genuine outbox flush after an
 * outage posts a burst of real bills and must never be throttled into failure.
 */
import "server-only";
import { hitBucket, type RateLimitResult } from "@/lib/repos/rate-limit";

export interface RateLimitPolicy {
  /** Short name; becomes part of the bucket key. */
  name: string;
  /** Maximum requests allowed inside one window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/** An outbox flush after a long outage is a legitimate burst — leave room. */
export const BILL_INGEST: RateLimitPolicy = {
  name: "bills",
  limit: 240,
  windowSeconds: 60,
};

export const CATALOG_SYNC: RateLimitPolicy = {
  name: "catalog",
  limit: 60,
  windowSeconds: 60,
};

/** Backups are heavy and rare. */
/** Registering from the counter: brisk, but not a script hammering the door. */
export const PATIENT_CREATE: RateLimitPolicy = {
  name: "patient_create",
  limit: 60,
  windowSeconds: 60,
};

export const BACKUP: RateLimitPolicy = {
  name: "backup",
  limit: 6,
  windowSeconds: 300,
};

/** Restores replace everything; a human does this once, deliberately. */
export const RESTORE: RateLimitPolicy = {
  name: "restore",
  limit: 3,
  windowSeconds: 3600,
};

/** Reads the caller's IP from the usual proxy headers. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Counts one request against the policy. `identity` should be a user id where
 * one exists, otherwise an IP.
 */
export async function checkRateLimit(
  policy: RateLimitPolicy,
  identity: string,
): Promise<RateLimitResult> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowIndex = Math.floor(nowSeconds / policy.windowSeconds);
  const expiresAt = (windowIndex + 1) * policy.windowSeconds;
  // The window index is part of the key, so each window is its own row and the
  // upsert needs no read-then-write.
  const bucket = `${policy.name}:${identity}:${windowIndex}`;
  return hitBucket(bucket, policy.limit, expiresAt);
}

/** The plain-language 429 body. Never mentions limits, buckets or windows. */
export function tooManyRequestsBody() {
  return {
    ok: false as const,
    code: "too_busy" as const,
    userMessage: "That's a lot at once — give it a moment and try again.",
  };
}
