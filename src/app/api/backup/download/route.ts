import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { exportAll, recordBackup } from "@/lib/repos/backup";
import { backupStorage, keepBackup, keepsBackups } from "@/lib/backups";
import { downloadName } from "@/lib/backup-keys";
import { streamBody } from "@/lib/stream-body";
import {
  checkRateLimit,
  BACKUP,
  tooManyRequestsBody,
} from "@/lib/rate-limit";

/**
 * GET /api/backup/download — full data backup as a JSON archive (Admin only).
 *
 * When a private store is connected a copy is kept there as well, so "Back up
 * now" is never the only copy. Keeping it is a bonus: if the store fails, the
 * download still goes ahead and the row records only that a file was handed
 * over.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      { ok: false, userMessage: "You don't have permission to do that." },
      { status: 403 },
    );
  }

  const limit = await checkRateLimit(BACKUP, session.user.id);
  if (!limit.ok) {
    return NextResponse.json(tooManyRequestsBody(), {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const archive = await exportAll();
  const body = JSON.stringify(archive);

  let kept = false;
  if (keepsBackups(await backupStorage())) {
    try {
      await keepBackup(archive, "manual");
      kept = true;
    } catch (err) {
      console.error("[backup/download] could not keep a copy", err);
    }
  }
  if (!kept) await recordBackup("manual", body.length);

  // Streamed: a function's ordinary response stops at 4.5 MB on Vercel, and a
  // clinic's backup grows past that. A streamed one has no such limit.
  return new NextResponse(streamBody(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${downloadName(archive.createdAt, "manual")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
