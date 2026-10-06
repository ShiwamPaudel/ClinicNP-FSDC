import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { exportAll } from "@/lib/repos/backup";
import { sweepExpired } from "@/lib/repos/rate-limit";
import {
  backupStorage,
  keepBackup,
  keepsBackups,
  letGoOfOldBackups,
} from "@/lib/backups";

/**
 * GET /api/cron/backup — the nightly backup (Vercel cron).
 *
 * Keeps a full copy in the private store and lets go of copies older than the
 * last thirty. With no private store connected it keeps nothing and records
 * nothing: a row with a size and no file is what made Settings list
 * "Automatic" backups that never existed (D-138). Also sweeps rate-limit
 * windows that have already ended.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const swept = await sweepExpired(Math.floor(Date.now() / 1000));

  const storage = await backupStorage();
  if (!keepsBackups(storage)) {
    console.warn(
      "[cron/backup] no private storage is connected, so no backup was kept",
    );
    return NextResponse.json({ ok: true, kept: false, storage, swept });
  }

  try {
    const kept = await keepBackup(await exportAll(), "nightly");
    const letGo = await letGoOfOldBackups();
    return NextResponse.json({ ok: true, kept: true, size: kept.size, letGo, swept });
  } catch (err) {
    console.error("[cron/backup] the nightly backup could not be kept", err);
    return NextResponse.json({ ok: false, kept: false, swept }, { status: 500 });
  }
}
