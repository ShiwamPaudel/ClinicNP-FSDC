/**
 * teeth.ts — a patient's tooth chart: a dated history per tooth (C-037,
 * 0025). A mark typed wrong is undone, never deleted.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import type { ToothRecord } from "@/lib/teeth";

export async function toothRecords(patientId: string): Promise<ToothRecord[]> {
  const res = await db().execute({
    sql: `SELECT t.*, u.name AS user_name FROM tooth_records t
            LEFT JOIN users u ON u.id = t.user_id
           WHERE t.patient_id = ?
           ORDER BY t.date_ad DESC, t.created_at DESC`,
    args: [patientId],
  });
  return res.rows.map((r: Row) => ({
    id: r.id as string,
    tooth: Number(r.tooth),
    condition: r.condition as string,
    surfaces: (r.surfaces as string) ?? "",
    note: (r.note as string) ?? "",
    dateBs: r.date_bs as string,
    dateAd: r.date_ad as string,
    createdAt: r.created_at as string,
    userName: (r.user_name as string | null) ?? "",
    voided: r.voided_at != null,
  }));
}

export async function addToothRecords(input: {
  patientId: string;
  teeth: number[];
  condition: string;
  surfaces: string;
  note: string;
  dateAd: string;
  dateBs: string;
  userId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await db().batch(
    input.teeth.map((tooth) => ({
      sql: `INSERT INTO tooth_records
              (id, patient_id, tooth, condition, surfaces, note, date_ad, date_bs, user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ulid(), input.patientId, tooth, input.condition, input.surfaces,
        input.note.trim(), input.dateAd, input.dateBs, input.userId, now,
      ],
    })),
    "write",
  );
}

/** Undo a mark. Returns the patient it belonged to, or null if it was not there. */
export async function undoToothRecord(id: string, userId: string): Promise<string | null> {
  const res = await db().execute({
    sql: `UPDATE tooth_records SET voided_at = ?, voided_by = ?
           WHERE id = ? AND voided_at IS NULL RETURNING patient_id`,
    args: [new Date().toISOString(), userId, id],
  });
  return (res.rows[0]?.patient_id as string | undefined) ?? null;
}
