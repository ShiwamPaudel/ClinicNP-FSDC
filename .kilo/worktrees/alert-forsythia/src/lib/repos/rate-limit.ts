/**
 * rate-limit.ts — request rate limiting kept entirely in our own database.
 * No third-party service: one row per fixed window, and because the bucket key
 * already encodes the window index, a single upsert is the whole algorithm.
 *
 * Fixed windows (not sliding) are deliberate: one round trip, no read-then-write
 * race, and the worst case — a burst straddling a window edge — is harmless for
 * what we are protecting against.
 */
import "server-only";
import { db } from "@/lib/db";

export interface RateLimitResult {
  ok: boolean;
  hits: number;
  limit: number;
  /** Seconds until the current window ends. */
  retryAfterSeconds: number;
}

/**
 * Counts one hit against `bucket` and reports whether it is over `limit`.
 * `bucket` must already include the window index.
 */
export async function hitBucket(
  bucket: string,
  limit: number,
  expiresAtUnix: number,
): Promise<RateLimitResult> {
  const res = await db().execute({
    sql: `INSERT INTO rate_limits (bucket, hits, expires_at)
          VALUES (?, 1, ?)
          ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1
          RETURNING hits`,
    args: [bucket, expiresAtUnix],
  });
  const hits = Number(res.rows[0]?.hits ?? 1);
  return {
    ok: hits <= limit,
    hits,
    limit,
    retryAfterSeconds: Math.max(1, expiresAtUnix - Math.floor(Date.now() / 1000)),
  };
}

/** Drops windows that have already ended. Called by the nightly cron. */
export async function sweepExpired(nowUnix: number): Promise<number> {
  const res = await db().execute({
    sql: "DELETE FROM rate_limits WHERE expires_at < ?",
    args: [nowUnix],
  });
  return res.rowsAffected;
}
