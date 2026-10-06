import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  attachmentsPastGrace,
  purgeAttachmentRow,
} from "@/lib/repos/attachments";
import { deleteFile } from "@/lib/file-store";

/**
 * GET /api/cron/files-gc — removes the bytes of files that were deleted more
 * than 30 days ago, then their metadata row.
 *
 * The delay is the point: deleting a file in the interface is recoverable for a
 * month (Architecture §2.6). The bytes go first; the row goes only if that
 * succeeded, so nothing is ever orphaned the wrong way round.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const due = await attachmentsPastGrace(30);
  let removed = 0;
  let failed = 0;

  for (const a of due) {
    try {
      await deleteFile(a.blobKey);
      await purgeAttachmentRow(a.id);
      removed++;
    } catch (err) {
      // Leave the row in place; the next run tries again.
      failed++;
      console.error("[files-gc] could not remove", a.id, err);
    }
  }

  return NextResponse.json({ ok: true, considered: due.length, removed, failed });
}
