/**
 * backup.ts — logical data backup & restore.
 *
 * NOTE (D-012): Architecture §2.5 describes a Turso branch-swap restore. That
 * needs the Turso platform API, which isn't wired here, so v1 implements a
 * logical JSON export/import: a full dump that restores by replacing all data
 * inside one transaction. Same guarantees for the shop's data; simpler ops.
 */
import "server-only";
import { ulid } from "ulid";
import { db, type Row } from "@/lib/db";

// Parent → child order for inserts; deletes run in reverse.
/**
 * Every table, in an order where each one's parents come before it.
 *
 * That order is what makes a restore work: rows go in parents-first, and the
 * clear-out runs the list backwards so children go first. Foreign keys are
 * deferred to COMMIT as well, so the snapshot is validated as a whole rather
 * than at each intermediate step — but the ordering means a restore is
 * comprehensible without relying on that.
 *
 * A table missing from this list is a table that silently does not survive a
 * restore, which is why `tests/backup.test.ts` compares it against the
 * database's own list of tables.
 */
const TABLES = [
  // settings and people
  "company",
  "fiscal_years",
  "counters",
  "users",

  // pharmacy
  "suppliers",
  // A restore inserts in this order, so a table comes after everything it
  // points at. item_locations points at both racks and items. Since 0013 the
  // item itself holds no shelf, so items no longer depend on racks.
  "racks",
  "items",
  "item_locations",
  "item_units",
  "purchases",
  "batches",
  "purchase_lines",
  "purchase_returns",
  "purchase_return_lines",
  "supplier_payments",

  // clinic catalog
  "service_groups",
  "doctors",
  "lab_partners",
  "services",

  // clinic records
  "patients",
  "visits",
  "appointments",

  // money
  "bills",
  "bill_lines",
  "bill_line_batches",
  "bill_service_lines",
  "sale_returns",
  "sale_return_lines",
  "sale_return_service_lines",
  "due_payments",
  "lab_partner_payments",

  // stock movement and adjustments
  "stock_moves",
  "stock_adjustments",
  "stock_adjustment_lines",

  // files (metadata; the bytes are listed separately in the manifest)
  "attachments",

  // what was sent to a doctor when somebody was booked in with them
  "alerts_sent",

  "audit_log",
] as const;

/** The tables a backup deliberately leaves out, and why. */
export const NOT_BACKED_UP: Record<string, string> = {
  _migrations: "rebuilt by running the migrations", // sweep-ok: never rendered
  backups: "a list of backups does not belong inside one",
  rate_limits: "short-lived counters, meaningless after a restore",
  login_throttle: "short-lived counters, meaningless after a restore",
  push_devices:
    "the address of one browser on one phone, minted by that browser and " +
    "meaningless anywhere else; a doctor turns alerts on again after a restore",
  cbms_queue:
    "left over from a feature the owner dropped; the table stays because 0004 " +
    "is applied and migrations are append-only, but nothing reads or writes it", // sweep-ok: never rendered
};

/**
 * One file's whereabouts, so a restored database can be matched back to the
 * bytes it refers to.
 *
 * The bytes themselves are NOT in the archive: a clinic's scans run to
 * hundreds of megabytes and a backup nobody can download is not a backup. The
 * manifest lists what should exist and where, so a restore can say plainly
 * which files it can and cannot find rather than showing a broken link.
 */
export interface BackupFile {
  attachmentId: string;
  patientId: string;
  visitId: string | null;
  fileName: string;
  mime: string;
  sizeBytes: number;
  blobKey: string;
}

export interface BackupArchive {
  /** 1 predates the clinic tables and the file manifest; both still restore. */
  version: 1 | 2;
  createdAt: string;
  tables: Record<string, Record<string, unknown>[]>;
  /** what files the database expects to find, and under which keys */
  files: BackupFile[];
}

export async function exportAll(): Promise<BackupArchive> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const t of TABLES) {
    const res = await db().execute(`SELECT * FROM ${t}`);
    tables[t] = res.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (const col of res.columns) obj[col] = (row as Record<string, unknown>)[col];
      return obj;
    });
  }

  const fileRows = await db().execute(
    `SELECT id, patient_id, visit_id, file_name, mime, size_bytes, blob_key
       FROM attachments WHERE deleted_at IS NULL`,
  );
  const files: BackupFile[] = fileRows.rows.map((r) => ({
    attachmentId: r.id as string,
    patientId: r.patient_id as string,
    visitId: (r.visit_id as string | null) ?? null,
    fileName: r.file_name as string,
    mime: r.mime as string,
    sizeBytes: Number(r.size_bytes),
    blobKey: r.blob_key as string,
  }));

  return {
    version: 2,
    createdAt: new Date().toISOString(),
    tables,
    files,
  };
}

export interface FileCheck {
  expected: number;
  found: number;
  missing: BackupFile[];
}

/**
 * Which of a backup's files can actually be found right now.
 *
 * Run after a restore, so the owner is told "412 of 415 files are here, these
 * three are not" instead of discovering a missing scan months later.
 */
export async function checkBackupFiles(
  archive: BackupArchive,
): Promise<FileCheck> {
  const { getFile } = await import("@/lib/file-store");
  const missing: BackupFile[] = [];
  for (const f of archive.files ?? []) {
    const found = await getFile(f.blobKey);
    if (!found) missing.push(f);
  }
  return {
    expected: archive.files?.length ?? 0,
    found: (archive.files?.length ?? 0) - missing.length,
    missing,
  };
}

export async function restoreAll(archive: BackupArchive): Promise<void> {
  // Version 1 archives predate the file manifest and the clinic tables. They
  // still restore — what they contain simply comes back and nothing else does.
  if (archive.version !== 1 && archive.version !== 2) {
    throw new Error("unsupported backup version");
  }
  const tx = await db().transaction("write");
  try {
    // Defer FK checks to COMMIT so the full replace is validated only against
    // the final, consistent snapshot (not intermediate delete/insert states).
    await tx.execute("PRAGMA defer_foreign_keys = ON");
    // clear existing data
    for (const t of [...TABLES].reverse()) {
      await tx.execute(`DELETE FROM ${t}`);
    }
    // insert from the snapshot
    for (const t of TABLES) {
      const rows = archive.tables[t] ?? [];
      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const placeholders = cols.map(() => "?").join(", ");
        await tx.execute({
          sql: `INSERT INTO ${t} (${cols.join(", ")}) VALUES (${placeholders})`,
          args: cols.map((c) => row[c] as never),
        });
      }
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export interface BackupRecord {
  id: string;
  kind: string;
  /** the kept copy's storage key, or 'download' when nothing was kept */
  blobUrl: string;
  size: number;
  createdAt: string;
}

function mapBackup(r: Row): BackupRecord {
  return {
    id: r.id as string,
    kind: r.kind as string,
    blobUrl: r.blob_url as string,
    size: Number(r.size),
    createdAt: r.created_at as string,
  };
}

export async function listBackups(): Promise<BackupRecord[]> {
  // Enough for thirty nightly copies, twenty of "Back up now" and a year-end
  // or two, with room left for the rows from before anything was kept.
  const res = await db().execute(
    "SELECT * FROM backups ORDER BY created_at DESC LIMIT 80",
  );
  return res.rows.map(mapBackup);
}

/**
 * One row per backup. `blobUrl` is the storage key of the kept copy, or
 * 'download' when the only copy is the file somebody downloaded — which, until
 * C-016, was every backup there was (D-138).
 */
export async function recordBackup(
  kind: "daily" | "manual",
  size: number,
  blobUrl = "download",
  createdAt = new Date().toISOString(),
): Promise<string> {
  const id = ulid();
  await db().execute({
    sql: `INSERT INTO backups (id, kind, blob_url, size, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [id, kind, blobUrl, size, createdAt],
  });
  return id;
}

export async function getBackupRecord(id: string): Promise<BackupRecord | null> {
  const res = await db().execute({
    sql: "SELECT * FROM backups WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? mapBackup(res.rows[0]) : null;
}

/** Every backup that has a kept copy, for deciding which to let go. */
export async function listKeptBackupRows(): Promise<BackupRecord[]> {
  const res = await db().execute(
    "SELECT * FROM backups WHERE blob_url LIKE 'backups/%' ORDER BY created_at",
  );
  return res.rows.map(mapBackup);
}

export async function deleteBackupRecord(id: string): Promise<void> {
  await db().execute({ sql: "DELETE FROM backups WHERE id = ?", args: [id] });
}

/** Any backup taken since `sinceIso`, kept or downloaded. */
export async function backupTakenSince(sinceIso: string): Promise<boolean> {
  const res = await db().execute({
    sql: "SELECT 1 FROM backups WHERE kind = 'manual' AND created_at >= ? LIMIT 1",
    args: [sinceIso],
  });
  return res.rows.length > 0;
}
