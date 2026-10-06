import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  restoreAll,
  checkBackupFiles,
  type BackupArchive,
} from "@/lib/repos/backup";
import { recordAudit } from "@/lib/repos/audit";
import {
  checkRateLimit,
  RESTORE,
  tooManyRequestsBody,
} from "@/lib/rate-limit";

/**
 * POST /api/backup/restore — replace all data from an uploaded archive (Admin).
 * Requires the typed confirmation phrase; the action is audit-logged.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      { ok: false, userMessage: "You don't have permission to do that." },
      { status: 403 },
    );
  }


  const limit = await checkRateLimit(RESTORE, session.user.id);
  if (!limit.ok) {
    return NextResponse.json(tooManyRequestsBody(), {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  let body: { confirm?: string; archive?: BackupArchive };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, userMessage: "Couldn't read the backup file." },
      { status: 400 },
    );
  }

  if (body.confirm !== "RESTORE") {
    return NextResponse.json(
      { ok: false, userMessage: "Type RESTORE to confirm." },
      { status: 400 },
    );
  }
  const version = body.archive?.version;
  if (!body.archive || (version !== 1 && version !== 2) || !body.archive.tables) {
    return NextResponse.json(
      { ok: false, userMessage: "That doesn't look like a valid backup file." },
      { status: 400 },
    );
  }

  try {
    await restoreAll(body.archive);
    await recordAudit(session.user.id, "restore", {
      backupCreatedAt: body.archive.createdAt,
    });
    // Say how many of the files the restored database refers to can actually
    // be found, rather than leaving broken links to be discovered later.
    const files = await checkBackupFiles(body.archive);
    return NextResponse.json({
      ok: true,
      files: {
        expected: files.expected,
        found: files.found,
        missing: files.missing.length,
      },
    });
  } catch (err) {
    console.error("[backup/restore]", err);
    return NextResponse.json(
      { ok: false, userMessage: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
