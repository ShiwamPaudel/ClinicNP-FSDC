/**
 * cron-auth.ts — verifies a cron request carries the shared secret.
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}
