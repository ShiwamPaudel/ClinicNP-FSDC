/**
 * attachments.ts — the metadata for a patient's files. The bytes live in
 * storage (lib/file-store.ts); this table only ever holds the key, and the key
 * never leaves the server (Rules §1.13).
 *
 * ClinicNP does not read these files. It bills the test and keeps the report
 * that came back, so it can be found again in two years (PRD §3.2). No result
 * entry, no reference ranges, no interpretation.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import type { AttachmentKind } from "@/lib/files";

export interface Attachment {
  id: string;
  patientId: string;
  visitId: string | null;
  billServiceLineId: string | null;
  kind: AttachmentKind;
  title: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  uploadedBy: string | null;
  uploaderName: string;
  createdAt: string;
  deletedAt: string | null;
}

/** Never leaves the repo layer. */
interface AttachmentWithKey extends Attachment {
  blobKey: string;
}

function mapAttachment(r: Row): Attachment {
  return {
    id: r.id as string,
    patientId: r.patient_id as string,
    visitId: (r.visit_id as string | null) ?? null,
    billServiceLineId: (r.bill_service_line_id as string | null) ?? null,
    kind: r.kind as AttachmentKind,
    title: (r.title as string) ?? "",
    fileName: r.file_name as string,
    mime: r.mime as string,
    sizeBytes: Number(r.size_bytes),
    uploadedBy: (r.uploaded_by as string | null) ?? null,
    uploaderName: (r.uploader_name as string) ?? "",
    createdAt: r.created_at as string,
    deletedAt: (r.deleted_at as string | null) ?? null,
  };
}

const SELECT = `
  SELECT a.*, u.name AS uploader_name
    FROM attachments a
    LEFT JOIN users u ON u.id = a.uploaded_by`;

export interface NewAttachmentInput {
  id: string;
  patientId: string;
  visitId?: string | null;
  billServiceLineId?: string | null;
  kind: AttachmentKind;
  title: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  blobKey: string;
  uploadedBy: string;
}

/**
 * Write the metadata row. The caller writes the bytes FIRST and only calls this
 * once they landed, so a failed upload leaves no half-record (Rules §4).
 */
export async function recordAttachment(
  input: NewAttachmentInput,
): Promise<Attachment> {
  await db().execute({
    sql: `INSERT INTO attachments
            (id, patient_id, visit_id, bill_service_line_id, kind, title,
             file_name, mime, size_bytes, blob_key, uploaded_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.id,
      input.patientId,
      input.visitId ?? null,
      input.billServiceLineId ?? null,
      input.kind,
      input.title,
      input.fileName,
      input.mime,
      input.sizeBytes,
      input.blobKey,
      input.uploadedBy,
      new Date().toISOString(),
    ],
  });
  const created = await getAttachment(input.id);
  if (!created) throw new Error("failed to record attachment");
  return created;
}

export async function getAttachment(id: string): Promise<Attachment | null> {
  const res = await db().execute({
    sql: `${SELECT} WHERE a.id = ? AND a.deleted_at IS NULL`,
    args: [id],
  });
  return res.rows[0] ? mapAttachment(res.rows[0]) : null;
}

/** Repo-internal: the serving route needs the key, nothing else ever does. */
export async function getAttachmentWithKey(
  id: string,
): Promise<AttachmentWithKey | null> {
  const res = await db().execute({
    sql: `${SELECT} WHERE a.id = ? AND a.deleted_at IS NULL`,
    args: [id],
  });
  const r = res.rows[0];
  if (!r) return null;
  return { ...mapAttachment(r), blobKey: r.blob_key as string };
}

export async function attachmentsForPatient(
  patientId: string,
): Promise<Attachment[]> {
  const res = await db().execute({
    sql: `${SELECT} WHERE a.patient_id = ? AND a.deleted_at IS NULL
          ORDER BY a.created_at DESC`,
    args: [patientId],
  });
  return res.rows.map(mapAttachment);
}

export async function attachmentsForVisit(
  visitId: string,
): Promise<Attachment[]> {
  const res = await db().execute({
    sql: `${SELECT} WHERE a.visit_id = ? AND a.deleted_at IS NULL
          ORDER BY a.created_at DESC`,
    args: [visitId],
  });
  return res.rows.map(mapAttachment);
}

/**
 * Soft delete. Admin only, audit-logged; the bytes survive for 30 days so a
 * mistake is recoverable (Architecture §2.6).
 */
export async function softDeleteAttachment(
  id: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db().batch([
    {
      sql: "UPDATE attachments SET deleted_at = ?, deleted_by = ? WHERE id = ?",
      args: [now, userId, id],
    },
    {
      sql: `INSERT INTO audit_log (id, user_id, action, detail_json, at)
            VALUES (?, ?, 'file.deleted', ?, ?)`,
      args: [ulid(), userId, JSON.stringify({ attachmentId: id }), now],
    },
  ]);
}

export interface ExpiredAttachment {
  id: string;
  blobKey: string;
}

/** Soft-deleted more than `days` ago: the nightly sweep removes the bytes. */
export async function attachmentsPastGrace(
  days = 30,
): Promise<ExpiredAttachment[]> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const res = await db().execute({
    sql: `SELECT id, blob_key FROM attachments
           WHERE deleted_at IS NOT NULL AND deleted_at < ?`,
    args: [cutoff],
  });
  return res.rows.map((r) => ({
    id: r.id as string,
    blobKey: r.blob_key as string,
  }));
}

/** Called only after the bytes are gone. */
export async function purgeAttachmentRow(id: string): Promise<void> {
  await db().execute({
    sql: "DELETE FROM attachments WHERE id = ? AND deleted_at IS NOT NULL",
    args: [id],
  });
}

export interface PendingFileRow {
  patientId: string;
  patientNo: number | null;
  patientName: string;
  visitId: string | null;
  visitNo: number | null;
  dateBs: string;
  dateAd: string;
  what: string;
}

/**
 * Visits with nothing attached yet, oldest first. Phase 3 narrows this to
 * billed services flagged "keeps a file"; until services exist, a visit with no
 * file is the honest stand-in.
 */
export async function filesPending(limit = 200): Promise<PendingFileRow[]> {
  const res = await db().execute({
    sql: `SELECT v.id AS visit_id, v.visit_no, v.date_bs, v.date_ad,
                 v.department, v.type,
                 p.id AS patient_id, p.patient_no, p.name AS patient_name
            FROM visits v
            JOIN patients p ON p.id = v.patient_id
           WHERE v.status != 'cancelled'
             AND NOT EXISTS (
               SELECT 1 FROM attachments a
                WHERE a.visit_id = v.id AND a.deleted_at IS NULL)
           ORDER BY v.date_ad ASC
           LIMIT ?`,
    args: [limit],
  });
  return res.rows.map((r) => ({
    patientId: r.patient_id as string,
    patientNo: r.patient_no != null ? Number(r.patient_no) : null,
    patientName: r.patient_name as string,
    visitId: r.visit_id as string,
    visitNo: r.visit_no != null ? Number(r.visit_no) : null,
    dateBs: r.date_bs as string,
    dateAd: r.date_ad as string,
    what: ((r.department as string) || "").trim() || "Visit",
  }));
}

export async function countPendingFiles(): Promise<number> {
  const res = await db().execute(
    `SELECT COUNT(*) AS n FROM visits v
      WHERE v.status != 'cancelled'
        AND NOT EXISTS (
          SELECT 1 FROM attachments a
           WHERE a.visit_id = v.id AND a.deleted_at IS NULL)`,
  );
  return Number(res.rows[0]!.n);
}
