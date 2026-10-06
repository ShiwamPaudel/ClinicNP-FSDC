"use server";

import { checkLoginAllowed } from "@/lib/repos/security";

/**
 * After a failed sign-in the form calls this to decide whether to show the
 * generic "wrong username or password" or the lockout message. Returns only a
 * boolean + retry time (no account details) to avoid leaking who exists.
 */
export async function loginBlockStatus(
  username: string,
): Promise<{ blocked: boolean; retryAfterSec: number }> {
  if (!username) return { blocked: false, retryAfterSec: 0 };
  const gate = await checkLoginAllowed(username);
  return { blocked: !gate.allowed, retryAfterSec: gate.retryAfterSec };
}
