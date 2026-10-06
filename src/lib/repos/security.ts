/**
 * security.ts — sign-in brute-force throttle. Server-only.
 *
 * Policy: after MAX_FAILS failures inside WINDOW, the identity is locked for LOCK.
 * A successful sign-in clears the record. Keyed per identity:
 *   - password login: lowercased username
 *   - PIN quick-switch: "pin:<userId>" (a 4-digit PIN has only 10k combinations,
 *     so throttling here is essential).
 */
import "server-only";
import { db } from "@/lib/db";

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCK_MS = 15 * 60 * 1000; // 15 minutes

export interface LoginGate {
  allowed: boolean;
  /** seconds until the lock lifts, when blocked */
  retryAfterSec: number;
}

function now(): number {
  return Date.now();
}

/** Is this identity currently allowed to attempt a sign-in? */
export async function checkLoginAllowed(identRaw: string): Promise<LoginGate> {
  const ident = identRaw.toLowerCase();
  const res = await db().execute({
    sql: "SELECT locked_until FROM login_throttle WHERE ident = ?",
    args: [ident],
  });
  const row = res.rows[0];
  if (!row || !row.locked_until) return { allowed: true, retryAfterSec: 0 };
  const lockedUntil = Date.parse(row.locked_until as string);
  if (Number.isNaN(lockedUntil) || lockedUntil <= now()) {
    return { allowed: true, retryAfterSec: 0 };
  }
  return {
    allowed: false,
    retryAfterSec: Math.ceil((lockedUntil - now()) / 1000),
  };
}

/** Record a failed attempt; locks the identity when the threshold is crossed. */
export async function recordLoginFailure(identRaw: string): Promise<void> {
  const ident = identRaw.toLowerCase();
  const nowIso = new Date().toISOString();
  const res = await db().execute({
    sql: "SELECT fail_count, first_fail_at FROM login_throttle WHERE ident = ?",
    args: [ident],
  });
  const row = res.rows[0];

  let failCount = 1;
  let firstFailAt = nowIso;

  if (row) {
    const firstAt = row.first_fail_at
      ? Date.parse(row.first_fail_at as string)
      : now();
    const withinWindow = now() - firstAt <= WINDOW_MS;
    if (withinWindow) {
      failCount = Number(row.fail_count) + 1;
      firstFailAt = row.first_fail_at as string;
    } else {
      // window elapsed — start a fresh count
      failCount = 1;
      firstFailAt = nowIso;
    }
  }

  const lockedUntil =
    failCount >= MAX_FAILS
      ? new Date(now() + LOCK_MS).toISOString()
      : null;

  await db().execute({
    sql: `INSERT INTO login_throttle (ident, fail_count, first_fail_at, locked_until)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(ident) DO UPDATE SET
            fail_count = excluded.fail_count,
            first_fail_at = excluded.first_fail_at,
            locked_until = excluded.locked_until`,
    args: [ident, failCount, firstFailAt, lockedUntil],
  });
}

/** Clear the throttle after a successful sign-in. */
export async function clearLoginFailures(identRaw: string): Promise<void> {
  await db().execute({
    sql: "DELETE FROM login_throttle WHERE ident = ?",
    args: [identRaw.toLowerCase()],
  });
}
