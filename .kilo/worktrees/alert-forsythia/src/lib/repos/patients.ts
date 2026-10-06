/**
 * patients.ts — the clinic's people.
 *
 * Patients exist only when the Clinic module is on, and only for clinical and
 * billing record-keeping. They are not customers: no loyalty, no marketing, no
 * bulk contact export (Rules §2.1, §2.6).
 *
 * The number is lifetime: allocated once from `counters` inside the same
 * transaction that inserts the patient, never reset at year close, never reused
 * after a merge (D-028).
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import type { AgeUnit } from "@/lib/age";

export type Sex = "f" | "m" | "o";

export interface Patient {
  id: string;
  patientNo: number | null;
  name: string;
  sex: Sex;
  ageValue: number | null;
  ageUnit: AgeUnit | null;
  ageAsOfAd: string | null;
  dobAd: string | null;
  phone: string;
  address: string;
  guardianName: string;
  bloodGroup: string;
  note: string;
  referredBy: string;
  active: boolean;
  mergedIntoId: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapPatient(r: Row): Patient {
  return {
    id: r.id as string,
    patientNo: r.patient_no != null ? Number(r.patient_no) : null,
    name: r.name as string,
    sex: r.sex as Sex,
    ageValue: r.age_value != null ? Number(r.age_value) : null,
    ageUnit: (r.age_unit as AgeUnit | null) ?? null,
    ageAsOfAd: (r.age_as_of_ad as string | null) ?? null,
    dobAd: (r.dob_ad as string | null) ?? null,
    phone: (r.phone as string) ?? "",
    address: (r.address as string) ?? "",
    guardianName: (r.guardian_name as string) ?? "",
    bloodGroup: (r.blood_group as string) ?? "",
    note: (r.note as string) ?? "",
    referredBy: (r.referred_by as string) ?? "",
    active: Number(r.active) === 1,
    mergedIntoId: (r.merged_into_id as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export interface NewPatientInput {
  /** Client-minted ULID, so an offline registration keeps its identity. */
  id?: string;
  name: string;
  sex: Sex;
  ageValue: number | null;
  ageUnit: AgeUnit | null;
  ageAsOfAd: string | null;
  dobAd: string | null;
  phone: string;
  address: string;
  guardianName?: string;
  bloodGroup?: string;
  note?: string;
  referredBy?: string;
  userId: string;
}

export class PatientNotFoundError extends Error {
  readonly code = "patient_not_found" as const;
  readonly userMessage = "That patient record no longer exists.";
  constructor() {
    super("patient not found");
    this.name = "PatientNotFoundError";
  }
}

/**
 * Register a patient and allocate the next lifetime number, in one transaction.
 * Idempotent on the id: syncing the same registration twice creates one patient
 * (Rules §1.8) and returns the number already assigned.
 */
export async function createPatient(input: NewPatientInput): Promise<Patient> {
  const id = input.id ?? ulid();

  const existing = await getPatient(id);
  if (existing) return existing;

  const now = new Date().toISOString();
  const tx = await db().transaction("write");
  try {
    // The counter and the insert move together: no gap, no duplicate.
    const seq = await tx.execute(
      "UPDATE counters SET next_value = next_value + 1 WHERE name = 'patient_no' RETURNING next_value",
    );
    const nextValue = Number(seq.rows[0]!.next_value);
    const patientNo = nextValue - 1;

    await tx.execute({
      sql: `INSERT INTO patients
              (id, patient_no, name, sex, age_value, age_unit, age_as_of_ad, dob_ad,
               phone, address, guardian_name, blood_group, note, referred_by,
               active, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      args: [
        id,
        patientNo,
        input.name.trim(),
        input.sex,
        input.ageValue,
        input.ageUnit,
        input.ageAsOfAd,
        input.dobAd,
        input.phone.trim(),
        input.address.trim(),
        input.guardianName?.trim() ?? "",
        input.bloodGroup?.trim() ?? "",
        input.note?.trim() ?? "",
        input.referredBy?.trim() ?? "",
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

  const created = await getPatient(id);
  if (!created) throw new Error("failed to create patient");
  return created;
}

export async function getPatient(id: string): Promise<Patient | null> {
  const res = await db().execute({
    sql: "SELECT * FROM patients WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? mapPatient(res.rows[0]) : null;
}

export async function getPatientByNo(no: number): Promise<Patient | null> {
  const res = await db().execute({
    sql: "SELECT * FROM patients WHERE patient_no = ?",
    args: [no],
  });
  return res.rows[0] ? mapPatient(res.rows[0]) : null;
}

/**
 * Search by name (partial), phone, or patient number. Prefix matches rank
 * first, then anything containing the term — so typing "ani" finds Anita
 * before Ramani.
 */
export async function searchPatients(
  term: string,
  limit = 50,
): Promise<Patient[]> {
  const q = term.trim();
  if (!q) return recentPatients(limit);

  const digits = q.replace(/\D/g, "");
  const asNumber = /^P?-?0*(\d+)$/i.exec(q.replace(/\s/g, ""));
  const like = `%${q.toLowerCase()}%`;
  const prefix = `${q.toLowerCase()}%`;

  const res = await db().execute({
    sql: `SELECT * FROM patients
           WHERE merged_into_id IS NULL
             AND ( LOWER(name) LIKE ?
                OR REPLACE(phone, ' ', '') LIKE ?
                OR CAST(patient_no AS TEXT) = ? )
           ORDER BY
             CASE WHEN LOWER(name) LIKE ? THEN 0 ELSE 1 END,
             name ASC
           LIMIT ?`,
    args: [
      like,
      // No digits typed means there is nothing to match a phone or a number
      // against: NULL makes both comparisons simply not true.
      digits ? `%${digits}%` : null,
      asNumber ? asNumber[1]! : null,
      prefix,
      limit,
    ],
  });
  return res.rows.map(mapPatient);
}

/** The most recently updated patients, for an empty search box. */
export async function recentPatients(limit = 50): Promise<Patient[]> {
  const res = await db().execute({
    sql: `SELECT * FROM patients WHERE merged_into_id IS NULL
          ORDER BY updated_at DESC LIMIT ?`,
    args: [limit],
  });
  return res.rows.map(mapPatient);
}

export async function countPatients(): Promise<number> {
  const res = await db().execute(
    "SELECT COUNT(*) AS n FROM patients WHERE merged_into_id IS NULL",
  );
  return Number(res.rows[0]!.n);
}

export interface DuplicateMatch {
  patient: Patient;
  /** Why we think it might be the same person, in plain words. */
  reason: string;
  lastVisitBs: string | null;
}

/**
 * Look for someone who might already be on file. Surfaced to a human, never
 * resolved automatically (Rules §2.7). Households share phone numbers, so a
 * phone match alone is a soft warning, not a block.
 */
export async function findPossibleDuplicates(
  name: string,
  phone: string,
  excludeId?: string,
): Promise<DuplicateMatch[]> {
  const cleanName = name.trim().toLowerCase();
  const cleanPhone = phone.replace(/\D/g, "");
  if (!cleanName && !cleanPhone) return [];

  const res = await db().execute({
    sql: `SELECT p.*,
                 (SELECT v.date_bs FROM visits v
                   WHERE v.patient_id = p.id AND v.status != 'cancelled'
                   ORDER BY v.date_ad DESC LIMIT 1) AS last_visit_bs
            FROM patients p
           WHERE p.merged_into_id IS NULL
             AND (? = '' OR p.id != ?)
             AND ( LOWER(p.name) = ?
                OR (? != '' AND REPLACE(p.phone, ' ', '') = ?) )
           LIMIT 10`,
    args: [
      excludeId ?? "",
      excludeId ?? "",
      cleanName,
      cleanPhone,
      cleanPhone,
    ],
  });

  return res.rows.map((r) => {
    const patient = mapPatient(r);
    const sameName = patient.name.trim().toLowerCase() === cleanName;
    const samePhone =
      cleanPhone !== "" && patient.phone.replace(/\D/g, "") === cleanPhone;
    const reason =
      sameName && samePhone
        ? "Same name and phone number"
        : sameName
          ? "Same name"
          : "Same phone number";
    return {
      patient,
      reason,
      lastVisitBs: (r.last_visit_bs as string | null) ?? null,
    };
  });
}

export interface UpdatePatientInput
  extends Omit<NewPatientInput, "userId" | "id"> {
  id: string;
}

export async function updatePatient(input: UpdatePatientInput): Promise<Patient> {
  const now = new Date().toISOString();
  const res = await db().execute({
    sql: `UPDATE patients
             SET name = ?, sex = ?, age_value = ?, age_unit = ?, age_as_of_ad = ?,
                 dob_ad = ?, phone = ?, address = ?, guardian_name = ?,
                 blood_group = ?, note = ?, referred_by = ?, updated_at = ?
           WHERE id = ?`,
    args: [
      input.name.trim(),
      input.sex,
      input.ageValue,
      input.ageUnit,
      input.ageAsOfAd,
      input.dobAd,
      input.phone.trim(),
      input.address.trim(),
      input.guardianName?.trim() ?? "",
      input.bloodGroup?.trim() ?? "",
      input.note?.trim() ?? "",
      input.referredBy?.trim() ?? "",
      now,
      input.id,
    ],
  });
  if (res.rowsAffected !== 1) throw new PatientNotFoundError();
  const updated = await getPatient(input.id);
  if (!updated) throw new PatientNotFoundError();
  return updated;
}

export async function setPatientActive(
  id: string,
  active: boolean,
): Promise<void> {
  await db().execute({
    sql: "UPDATE patients SET active = ?, updated_at = ? WHERE id = ?",
    args: [active ? 1 : 0, new Date().toISOString(), id],
  });
}

export class MergeError extends Error {
  readonly code = "merge_failed" as const;
  constructor(readonly userMessage: string) {
    super(userMessage);
    this.name = "MergeError";
  }
}

/**
 * Merge one patient into another. Admin only, audit-logged, never automatic
 * (Rules §2.7). Visits, bills and files move to the kept record; the merged-away
 * record stays, pointing at its new home, and its number is retired — never
 * handed to anyone else (D-028).
 */
export async function mergePatients(
  keepId: string,
  mergeId: string,
  userId: string,
): Promise<{ moved: { visits: number; bills: number; files: number } }> {
  if (keepId === mergeId) {
    throw new MergeError("Choose two different patients to merge.");
  }

  const [keep, merge] = await Promise.all([
    getPatient(keepId),
    getPatient(mergeId),
  ]);
  if (!keep || !merge) throw new PatientNotFoundError();
  if (merge.mergedIntoId) {
    throw new MergeError("That record has already been merged.");
  }
  if (keep.mergedIntoId) {
    throw new MergeError("Merge into a record that is still in use.");
  }

  const now = new Date().toISOString();
  const tx = await db().transaction("write");
  try {
    const v = await tx.execute({
      sql: "UPDATE visits SET patient_id = ?, updated_at = ? WHERE patient_id = ?",
      args: [keepId, now, mergeId],
    });
    const b = await tx.execute({
      sql: "UPDATE bills SET patient_id = ? WHERE patient_id = ?",
      args: [keepId, mergeId],
    });
    const f = await tx.execute({
      sql: "UPDATE attachments SET patient_id = ? WHERE patient_id = ?",
      args: [keepId, mergeId],
    });

    await tx.execute({
      sql: `UPDATE patients
               SET merged_into_id = ?, active = 0, updated_at = ?
             WHERE id = ?`,
      args: [keepId, now, mergeId],
    });

    await tx.execute({
      sql: `INSERT INTO audit_log (id, user_id, action, detail_json, at)
            VALUES (?, ?, 'patient.merged', ?, ?)`,
      args: [
        ulid(),
        userId,
        JSON.stringify({
          keptId: keepId,
          keptNo: keep.patientNo,
          mergedId: mergeId,
          // the retired number, recorded so it is never reissued
          retiredNo: merge.patientNo,
          moved: {
            visits: v.rowsAffected,
            bills: b.rowsAffected,
            files: f.rowsAffected,
          },
        }),
        now,
      ],
    });

    await tx.commit();
    return {
      moved: {
        visits: v.rowsAffected,
        bills: b.rowsAffected,
        files: f.rowsAffected,
      },
    };
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      // already unwound
    }
    throw err;
  }
}

/** Records that were merged away, so a lookup can follow the trail. */
export async function resolveMerged(id: string): Promise<Patient | null> {
  let current = await getPatient(id);
  let hops = 0;
  while (current?.mergedIntoId && hops < 10) {
    current = await getPatient(current.mergedIntoId);
    hops++;
  }
  return current;
}

export interface DuplicatePair {
  aId: string;
  aNo: number | null;
  aName: string;
  aPhone: string;
  aCreatedAt: string;
  aVisits: number;
  bId: string;
  bNo: number | null;
  bName: string;
  bPhone: string;
  bCreatedAt: string;
  bVisits: number;
  reason: string;
}

/**
 * Pairs of records that look like the same person, for an Admin to review.
 *
 * Two devices registering the same person while both were offline is the case
 * this exists for: each device minted its own id, so both records land and
 * both are real. Nothing is merged automatically — a shared household phone is
 * common, and two people can genuinely have one name. The Admin decides.
 */
export async function possibleDuplicatePairs(
  limit = 100,
): Promise<DuplicatePair[]> {
  const res = await db().execute({
    sql: `SELECT a.id a_id, a.patient_no a_no, a.name a_name, a.phone a_phone,
                 a.created_at a_created,
                 (SELECT COUNT(*) FROM visits v WHERE v.patient_id = a.id) a_visits,
                 b.id b_id, b.patient_no b_no, b.name b_name, b.phone b_phone,
                 b.created_at b_created,
                 (SELECT COUNT(*) FROM visits v WHERE v.patient_id = b.id) b_visits,
                 CASE
                   WHEN LOWER(a.name) = LOWER(b.name)
                    AND REPLACE(a.phone,' ','') = REPLACE(b.phone,' ','')
                    AND a.phone != ''
                     THEN 'Same name and same phone'
                   WHEN LOWER(a.name) = LOWER(b.name) THEN 'Same name'
                   ELSE 'Same phone'
                 END AS reason
            FROM patients a
            JOIN patients b
              ON b.rowid > a.rowid
             AND ( LOWER(a.name) = LOWER(b.name)
                OR (a.phone != '' AND REPLACE(a.phone,' ','') = REPLACE(b.phone,' ','')) )
           WHERE a.merged_into_id IS NULL AND b.merged_into_id IS NULL
           ORDER BY b.created_at DESC
           LIMIT ?`,
    args: [limit],
  });

  return res.rows.map((r) => ({
    aId: r.a_id as string,
    aNo: r.a_no == null ? null : Number(r.a_no),
    aName: r.a_name as string,
    aPhone: (r.a_phone as string) ?? "",
    aCreatedAt: r.a_created as string,
    aVisits: Number(r.a_visits),
    bId: r.b_id as string,
    bNo: r.b_no == null ? null : Number(r.b_no),
    bName: r.b_name as string,
    bPhone: (r.b_phone as string) ?? "",
    bCreatedAt: r.b_created as string,
    bVisits: Number(r.b_visits),
    reason: r.reason as string,
  }));
}
