/**
 * audit.ts — the audit trail (bill cancels, restores, and other sensitive acts).
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";

export interface AuditEntry {
  id: string;
  userName: string;
  action: string;
  detail: string;
  at: string;
}

export async function recordAudit(
  userId: string | null,
  action: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await db().execute({
    sql: `INSERT INTO audit_log (id, user_id, action, detail_json, at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [ulid(), userId, action, JSON.stringify(detail), new Date().toISOString()],
  });
}

export async function listAudit(limit = 200): Promise<AuditEntry[]> {
  const res = await db().execute({
    sql: `SELECT a.*, u.name AS user_name FROM audit_log a
          LEFT JOIN users u ON u.id = a.user_id
          ORDER BY a.at DESC LIMIT ?`,
    args: [limit],
  });
  return res.rows.map((r) => ({
    id: r.id as string,
    userName: (r.user_name as string) ?? "System",
    action: r.action as string,
    detail: (r.detail_json as string) ?? "{}",
    at: r.at as string,
  }));
}
