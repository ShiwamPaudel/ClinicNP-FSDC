/**
 * visits.ts — one encounter, on one BS date.
 *
 * A visit carries complaint / findings / advice as three free-text fields and
 * an optional vitals row. Nothing here interprets, flags or colour-codes a
 * clinical value (Rules §2.3, §2.5) — the software does not argue with the
 * front desk.
 *
 * Visits are never deleted. One created by mistake is cancelled with a reason,
 * stays visible to Admin, and drops out of the counts.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import { getOpenFiscalYear, bootstrapCurrentFiscalYear } from "@/lib/repos/fiscal";
import type { VisitType, VisitStatus } from "@/lib/visit-types";

// The vocabulary lives in lib/visit-types so the browser can import it too;
// re-exported here so server callers have one place to look.
export type { VisitType, VisitStatus };
export {
  VISIT_TYPE_LABEL,
  VISIT_STATUS_LABEL,
  SELECTABLE_VISIT_STATUSES,
} from "@/lib/visit-types";

export interface Vitals {
  bp: string;
  pulse: number | null;
  tempC: number | null;
  weightKg: number | null;
  spo2: number | null;
}

export interface Visit extends Vitals {
  id: string;
  visitNo: number | null;
  fiscalLabel: string;
  fiscalYearId: number | null;
  patientId: string;
  dateAd: string;
  dateBs: string;
  type: VisitType;
  doctorId: string | null;
  department: string;
  complaint: string;
  findings: string;
  advice: string;
  status: VisitStatus;
  cancelReason: string;
  createdAt: string;
  updatedAt: string;
}

export interface VisitWithPatient extends Visit {
  patientName: string;
  patientNo: number | null;
  patientSex: string;
  patientAgeValue: number | null;
  patientAgeUnit: string | null;
  patientAgeAsOfAd: string | null;
  patientDobAd: string | null;
}

function mapVisit(r: Row): Visit {
  return {
    id: r.id as string,
    visitNo: r.visit_no != null ? Number(r.visit_no) : null,
    fiscalLabel: (r.bs_label as string) ?? "",
    fiscalYearId: r.fiscal_year_id != null ? Number(r.fiscal_year_id) : null,
    patientId: r.patient_id as string,
    dateAd: r.date_ad as string,
    dateBs: r.date_bs as string,
    type: r.type as VisitType,
    doctorId: (r.doctor_id as string | null) ?? null,
    department: (r.department as string) ?? "",
    complaint: (r.complaint as string) ?? "",
    findings: (r.findings as string) ?? "",
    advice: (r.advice as string) ?? "",
    bp: (r.bp as string) ?? "",
    pulse: r.pulse != null ? Number(r.pulse) : null,
    tempC: r.temp_c != null ? Number(r.temp_c) : null,
    weightKg: r.weight_kg != null ? Number(r.weight_kg) : null,
    spo2: r.spo2 != null ? Number(r.spo2) : null,
    status: r.status as VisitStatus,
    cancelReason: (r.cancel_reason as string) ?? "",
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapVisitWithPatient(r: Row): VisitWithPatient {
  return {
    ...mapVisit(r),
    patientName: (r.patient_name as string) ?? "",
    patientNo: r.patient_no != null ? Number(r.patient_no) : null,
    patientSex: (r.patient_sex as string) ?? "o",
    patientAgeValue: r.age_value != null ? Number(r.age_value) : null,
    patientAgeUnit: (r.age_unit as string | null) ?? null,
    patientAgeAsOfAd: (r.age_as_of_ad as string | null) ?? null,
    patientDobAd: (r.dob_ad as string | null) ?? null,
  };
}

const WITH_PATIENT = `
  SELECT v.*, f.bs_label,
         p.name AS patient_name, p.patient_no, p.sex AS patient_sex,
         p.age_value, p.age_unit, p.age_as_of_ad, p.dob_ad
    FROM visits v
    LEFT JOIN fiscal_years f ON f.id = v.fiscal_year_id
    JOIN patients p ON p.id = v.patient_id`;

export interface NewVisitInput {
  id?: string;
  patientId: string;
  dateAd: string;
  dateBs: string;
  type: VisitType;
  doctorId?: string | null;
  department?: string;
  complaint?: string;
  vitals?: Partial<Vitals>;
  userId: string;
}

/** Create a visit and take the next number from the open fiscal year. */
export async function createVisit(input: NewVisitInput): Promise<Visit> {
  const id = input.id ?? ulid();
  const existing = await getVisit(id);
  if (existing) return existing;

  const fy = (await getOpenFiscalYear()) ?? (await bootstrapCurrentFiscalYear());
  const now = new Date().toISOString();

  const tx = await db().transaction("write");
  try {
    const seq = await tx.execute({
      sql: "SELECT next_visit_no FROM fiscal_years WHERE id = ?",
      args: [fy.id],
    });
    const visitNo = Number(seq.rows[0]!.next_visit_no);
    await tx.execute({
      sql: "UPDATE fiscal_years SET next_visit_no = ? WHERE id = ?",
      args: [visitNo + 1, fy.id],
    });

    await tx.execute({
      sql: `INSERT INTO visits
              (id, visit_no, fiscal_year_id, patient_id, date_ad, date_bs, type,
               doctor_id, department, complaint, findings, advice,
               bp, pulse, temp_c, weight_kg, spo2, status, cancel_reason,
               user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, 'waiting', '', ?, ?, ?)`,
      args: [
        id,
        visitNo,
        fy.id,
        input.patientId,
        input.dateAd,
        input.dateBs,
        input.type,
        input.doctorId ?? null,
        input.department?.trim() ?? "",
        input.complaint?.trim() ?? "",
        input.vitals?.bp?.trim() ?? "",
        input.vitals?.pulse ?? null,
        input.vitals?.tempC ?? null,
        input.vitals?.weightKg ?? null,
        input.vitals?.spo2 ?? null,
        input.userId,
        now,
        now,
      ],
    });

    await tx.commit();
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      // already unwound
    }
    throw err;
  }

  const created = await getVisit(id);
  if (!created) throw new Error("failed to create visit");
  return created;
}

export async function getVisit(id: string): Promise<Visit | null> {
  const res = await db().execute({
    sql: `SELECT v.*, f.bs_label FROM visits v
          LEFT JOIN fiscal_years f ON f.id = v.fiscal_year_id
          WHERE v.id = ?`,
    args: [id],
  });
  return res.rows[0] ? mapVisit(res.rows[0]) : null;
}

export async function getVisitWithPatient(
  id: string,
): Promise<VisitWithPatient | null> {
  const res = await db().execute({
    sql: `${WITH_PATIENT} WHERE v.id = ?`,
    args: [id],
  });
  return res.rows[0] ? mapVisitWithPatient(res.rows[0]) : null;
}

/** The front desk's home screen when the clinic module is on. */
export async function visitsOn(dateAd: string): Promise<VisitWithPatient[]> {
  const res = await db().execute({
    sql: `${WITH_PATIENT} WHERE v.date_ad = ? ORDER BY v.created_at ASC`,
    args: [dateAd],
  });
  return res.rows.map(mapVisitWithPatient);
}

export interface VisitFilters {
  fromIso: string;
  toIso: string;
  status?: VisitStatus | null;
  doctorId?: string | null;
  patientId?: string | null;
  limit?: number;
}

export async function listVisits(f: VisitFilters): Promise<VisitWithPatient[]> {
  const clauses = ["v.date_ad >= ?", "v.date_ad <= ?"];
  const args: (string | number)[] = [f.fromIso, f.toIso];
  if (f.status) {
    clauses.push("v.status = ?");
    args.push(f.status);
  }
  if (f.doctorId) {
    clauses.push("v.doctor_id = ?");
    args.push(f.doctorId);
  }
  if (f.patientId) {
    clauses.push("v.patient_id = ?");
    args.push(f.patientId);
  }
  args.push(f.limit ?? 200);

  const res = await db().execute({
    sql: `${WITH_PATIENT} WHERE ${clauses.join(" AND ")}
          ORDER BY v.date_ad DESC, v.created_at DESC LIMIT ?`,
    args,
  });
  return res.rows.map(mapVisitWithPatient);
}

/** Every visit for one patient, newest first — the card's timeline. */
export async function visitsForPatient(patientId: string): Promise<Visit[]> {
  const res = await db().execute({
    sql: `SELECT v.*, f.bs_label FROM visits v
          LEFT JOIN fiscal_years f ON f.id = v.fiscal_year_id
          WHERE v.patient_id = ?
          ORDER BY v.date_ad DESC, v.created_at DESC`,
    args: [patientId],
  });
  return res.rows.map(mapVisit);
}

/** Today's open visit for a patient, if there is one (Phase 3 attaches to it). */
export async function openVisitToday(
  patientId: string,
  dateAd: string,
): Promise<Visit | null> {
  const res = await db().execute({
    sql: `SELECT v.*, f.bs_label FROM visits v
          LEFT JOIN fiscal_years f ON f.id = v.fiscal_year_id
          WHERE v.patient_id = ? AND v.date_ad = ? AND v.status != 'cancelled'
          ORDER BY v.created_at DESC LIMIT 1`,
    args: [patientId, dateAd],
  });
  return res.rows[0] ? mapVisit(res.rows[0]) : null;
}

export interface UpdateVisitInput {
  id: string;
  type?: VisitType;
  doctorId?: string | null;
  department?: string;
  complaint?: string;
  findings?: string;
  advice?: string;
  vitals?: Partial<Vitals>;
  status?: Exclude<VisitStatus, "cancelled">;
}

export async function updateVisit(input: UpdateVisitInput): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const put = (col: string, value: string | number | null) => {
    sets.push(`${col} = ?`);
    args.push(value);
  };

  if (input.type !== undefined) put("type", input.type);
  if (input.doctorId !== undefined) put("doctor_id", input.doctorId);
  if (input.department !== undefined) put("department", input.department.trim());
  if (input.complaint !== undefined) put("complaint", input.complaint.trim());
  if (input.findings !== undefined) put("findings", input.findings.trim());
  if (input.advice !== undefined) put("advice", input.advice.trim());
  if (input.status !== undefined) put("status", input.status);
  if (input.vitals) {
    if (input.vitals.bp !== undefined) put("bp", input.vitals.bp.trim());
    if (input.vitals.pulse !== undefined) put("pulse", input.vitals.pulse);
    if (input.vitals.tempC !== undefined) put("temp_c", input.vitals.tempC);
    if (input.vitals.weightKg !== undefined) put("weight_kg", input.vitals.weightKg);
    if (input.vitals.spo2 !== undefined) put("spo2", input.vitals.spo2);
  }

  if (sets.length === 0) return;
  put("updated_at", new Date().toISOString());
  args.push(input.id);

  await db().execute({
    sql: `UPDATE visits SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });
}

/** Visits are never deleted — a mistake is cancelled with a reason. */
export async function cancelVisit(
  id: string,
  reason: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db().batch([
    {
      sql: `UPDATE visits SET status = 'cancelled', cancel_reason = ?, updated_at = ?
             WHERE id = ?`,
      args: [reason.trim(), now, id],
    },
    {
      sql: `INSERT INTO audit_log (id, user_id, action, detail_json, at)
            VALUES (?, ?, 'visit.cancelled', ?, ?)`,
      args: [ulid(), userId, JSON.stringify({ visitId: id, reason }), now],
    },
  ]);
}

/** Counts for the Today screen header. */
export async function visitCountsOn(dateAd: string): Promise<{
  total: number;
  waiting: number;
  seen: number;
}> {
  const res = await db().execute({
    sql: `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) AS waiting,
            SUM(CASE WHEN status IN ('seen','closed') THEN 1 ELSE 0 END) AS seen
          FROM visits WHERE date_ad = ? AND status != 'cancelled'`,
    args: [dateAd],
  });
  const r = res.rows[0]!;
  return {
    total: Number(r.total ?? 0),
    waiting: Number(r.waiting ?? 0),
    seen: Number(r.seen ?? 0),
  };
}
