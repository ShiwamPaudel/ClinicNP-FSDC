/**
 * backups.ts — keeping backups somewhere, not just counting them. Server only.
 *
 * Until C-016 the nightly job and the close-year wizard each built a full
 * backup, wrote its size into the `backups` table and threw it away; Settings
 * listed those as "Automatic" and nothing could be restored from any of them
 * (D-138). A backup is now kept only where patient data may live: the same
 * private store patient files use (Rules §1.13, D-055). With no such store
 * connected nothing is kept, nothing pretends to be, and the Backup screen
 * says so.
 *
 * Copies are gzipped — the JSON shrinks about five times — and handed back
 * as the plain JSON file "Restore" already accepts.
 */
import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import { deleteFile, getFile, putFile, storageMode } from "@/lib/file-store";
import {
  deleteBackupRecord,
  getBackupRecord,
  listKeptBackupRows,
  recordBackup,
  type BackupArchive,
} from "@/lib/repos/backup";
import {
  backupsToLetGo,
  downloadName,
  isKeptKey,
  keptBackupKey,
  kindFor,
  purposeOf,
  type BackupPurpose,
} from "@/lib/backup-keys";

/**
 * Whether backups can be kept, and if not, why.
 *   cloud   — a private store is connected: backups are kept.
 *   local   — development and tests: kept in the gitignored .filestore folder.
 *   refused — a store is connected but it is public (or its credentials fail).
 *   none    — nothing is connected on a live server.
 */
export type BackupStorage = "cloud" | "local" | "refused" | "none";

export async function backupStorage(): Promise<BackupStorage> {
  const mode = await storageMode();
  if (mode === "cloud") return "cloud";
  if (mode === "refused") return "refused";
  // A live server's own disk is not a place to keep anything: on Vercel it
  // is read-only and gone with the next deploy.
  return process.env.NODE_ENV === "production" ? "none" : "local";
}

export function keepsBackups(storage: BackupStorage): boolean {
  return storage === "cloud" || storage === "local";
}

export interface KeptBackup {
  id: string;
  key: string;
  /** size of the JSON, as the list has always shown it */
  size: number;
  createdAt: string;
}

/**
 * Keep a copy of `archive`, then record it. The file goes first and the row
 * only once the file is safely stored, so a row never points at nothing.
 */
export async function keepBackup(
  archive: BackupArchive,
  purpose: BackupPurpose,
): Promise<KeptBackup> {
  const json = JSON.stringify(archive);
  const createdAt = archive.createdAt;
  const key = keptBackupKey(createdAt, purpose);
  await putFile(key, gzipSync(Buffer.from(json, "utf8")), "application/gzip");
  const id = await recordBackup(kindFor(purpose), json.length, key, createdAt);
  return { id, key, size: json.length, createdAt };
}

/** A kept backup as the JSON file Restore takes, or null if there is none. */
export async function readKeptBackup(
  id: string,
): Promise<{ json: Buffer; fileName: string } | null> {
  const rec = await getBackupRecord(id);
  if (!rec || !isKeptKey(rec.blobUrl)) return null;
  const file = await getFile(rec.blobUrl);
  if (!file) return null;
  return {
    json: gunzipSync(file.body),
    fileName: downloadName(rec.createdAt, purposeOf(rec.kind, rec.blobUrl)),
  };
}

/**
 * Let go of kept copies past what is kept of their kind (30 nightly, 20 from
 * "Back up now"; year-end copies are kept for good). The file goes first and
 * the row only after, so a failure leaves a row that the next run retries —
 * never a stored backup nobody can see.
 */
export async function letGoOfOldBackups(): Promise<number> {
  const rows = await listKeptBackupRows();
  let removed = 0;
  for (const r of backupsToLetGo(rows)) {
    try {
      await deleteFile(r.blobUrl);
      await deleteBackupRecord(r.id);
      removed++;
    } catch (err) {
      console.error("[backups] could not let go of", r.id, err);
    }
  }
  return removed;
}
