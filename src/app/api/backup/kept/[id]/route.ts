import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readKeptBackup } from "@/lib/backups";
import { streamBody } from "@/lib/stream-body";
import {
  checkRateLimit,
  BACKUP,
  tooManyRequestsBody,
} from "@/lib/rate-limit";

/**
 * GET /api/backup/kept/:id — download one kept backup (Admin only).
 *
 * The copy is read from the private store on the server and handed over as the
 * same plain JSON file "Back up now" gives, so Restore takes it unchanged. The
 * store's own address is never sent to the browser (Rules §1.13).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  const kept = await readKeptBackup(id).catch((err: unknown) => {
    console.error("[backup/kept] could not read", id, err);
    return null;
  });
  if (!kept) {
    return NextResponse.json(
      { ok: false, userMessage: "That backup could not be found." },
      { status: 404 },
    );
  }

  return new NextResponse(streamBody(kept.json), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${kept.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
