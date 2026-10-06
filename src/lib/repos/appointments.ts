/**
 * appointments.ts — a consultation somebody agreed would happen.
 *
 * A booking is not a visit. A visit is the record of an encounter that took
 * place; a booking is an arrangement that may yet be cancelled, missed, or
 * turn into a visit. They are separate rows, and `visit_id` is set only when
 * the person actually walked in.
 *
 * Bookings are never deleted. One made by mistake is cancelled with a reason
 * and stays on the doctor's history.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import type { AppointmentStatus } from "@/lib/appointment-types";
import { overlaps } from "@/lib/appointment-types";

export type { AppointmentStatus };

export interface Appointment {
  id: string;
  doctorId: string;
  patientId: string;
  dateAd: string;
  dateBs: string;
  timeHhmm: string;
  durationMin: number;
  reason: string;
  status: AppointmentStatus;
  cancelReason: string;
  visitId: string | null;
  bookedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentRow extends Appointment {
  doctorName: string;
  doctorSpecialty: string;
  patientName: string;
  patientNo: number | null;
  patientPhone: string;
  patientSex: string;
  patientAgeValue: number | null;
  patientAgeUnit: string | null;
  patientAgeAsOfAd: string | null;
  patientDobAd: string | null;
}

function mapAppointment(r: Row): Appointment {
  return {
    id: r.id as string,
    doctorId: r.doctor_id as string,
    patientId: r.patient_id as string,
    dateAd: r.date_ad as string,
    dateBs: r.date_bs as string,
    timeHhmm: r.time_hhmm as string,
    durationMin: Number(r.duration_min),
    reason: (r.reason as string) ?? "",
    status: r.status as AppointmentStatus,
    cancelReason: (r.cancel_reason as string) ?? "",
    visitId: (r.visit_id as string | null) ?? null,
    bookedBy: (r.booked_by as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapRow(r: Row): AppointmentRow {
  return {
    ...mapAppointment(r),
    doctorName: (r.doctor_name as string) ?? "",
    doctorSpecialty: (r.doctor_specialty as string) ?? "",
    patientName: (r.patient_name as string) ?? "",
    patientNo: r.patient_no != null ? Number(r.patient_no) : null,
    patientPhone: (r.patient_phone as string) ?? "",
    patientSex: (r.patient_sex as string) ?? "o",
    patientAgeValue: r.age_value != null ? Number(r.age_value) : null,
    patientAgeUnit: (r.age_unit as string | null) ?? null,
    patientAgeAsOfAd: (r.age_as_of_ad as string | null) ?? null,
    patientDobAd: (r.dob_ad as string | null) ?? null,
  };
}

const FULL = `
  SELECT a.*,
         d.name AS doctor_name, d.specialty AS doctor_specialty,
         p.name AS patient_name, p.patient_no, p.phone AS patient_phone,
         p.sex AS patient_sex, p.age_value, p.age_unit, p.age_as_of_ad, p.dob_ad
    FROM appointments a
    JOIN doctors d ON d.id = a.doctor_id
    JOIN patients p ON p.id = a.patient_id`;

export class DoubleBookedError extends Error {
  readonly code = "double_booked" as const;
  readonly userMessage: string;
  constructor(clashWith: string) {
    super("double booked");
    this.name = "DoubleBookedError";
    this.userMessage = `That time is already taken — ${clashWith} is booked in then. Pick another time.`;
  }
}

export interface NewAppointmentInput {
  id?: string;
  doctorId: string;
  patientId: string;
  dateAd: string;
  dateBs: string;
  timeHhmm: string;
  durationMin: number;
  reason: string;
  bookedBy: string;
}

/**
 * Book a consultation.
 *
 * Idempotent on the id, so a retry from a phone with a bad connection books
 * one consultation and not two (Rules §1.8).
 */
export async function createAppointment(
  input: NewAppointmentInput,
): Promise<Appointment> {
  const id = input.id ?? ulid();

  const existing = await getAppointment(id);
  if (existing) return existing;

  // Two people cannot be with the same doctor at the same moment. Only
  // bookings still expected to happen count — a cancelled one frees its slot.
  const sameDay = await appointmentsForDoctorOn(input.doctorId, input.dateAd);
  const clash = sameDay.find(
    (a) =>
      (a.status === "booked" || a.status === "arrived") &&
      overlaps(
        { timeHhmm: a.timeHhmm, durationMin: a.durationMin },
        { timeHhmm: input.timeHhmm, durationMin: input.durationMin },
      ),
  );
  if (clash) throw new DoubleBookedError(clash.patientName);

  const now = new Date().toISOString();
  await db().execute({
    sql: `INSERT INTO appointments
            (id, doctor_id, patient_id, date_ad, date_bs, time_hhmm,
             duration_min, reason, status, cancel_reason, visit_id,
             booked_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'booked', '', NULL, ?, ?, ?)`,
    args: [
      id,
      input.doctorId,
      input.patientId,
      input.dateAd,
      input.dateBs,
      input.timeHhmm,
      input.durationMin,
      input.reason,
      input.bookedBy,
      now,
      now,
    ],
  });

  const made = await getAppointment(id);
  if (!made) throw new Error("appointment did not save");
  return made;
}

export async function getAppointment(id: string): Promise<Appointment | null> {
  const res = await db().execute({
    sql: "SELECT * FROM appointments WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? mapAppointment(res.rows[0]) : null;
}

export async function getAppointmentRow(
  id: string,
): Promise<AppointmentRow | null> {
  const res = await db().execute({
    sql: `${FULL} WHERE a.id = ?`,
    args: [id],
  });
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

/** One doctor's whole day, earliest first. */
export async function appointmentsForDoctorOn(
  doctorId: string,
  dateAd: string,
): Promise<AppointmentRow[]> {
  const res = await db().execute({
    sql: `${FULL} WHERE a.doctor_id = ? AND a.date_ad = ?
          ORDER BY a.time_hhmm ASC`,
    args: [doctorId, dateAd],
  });
  return res.rows.map(mapRow);
}

/** One doctor over a stretch of days — the phone's "next few days" list. */
export async function appointmentsForDoctorBetween(
  doctorId: string,
  fromAd: string,
  toAd: string,
): Promise<AppointmentRow[]> {
  const res = await db().execute({
    sql: `${FULL} WHERE a.doctor_id = ? AND a.date_ad BETWEEN ? AND ?
          ORDER BY a.date_ad ASC, a.time_hhmm ASC`,
    args: [doctorId, fromAd, toAd],
  });
  return res.rows.map(mapRow);
}

/** Everyone's bookings on one day, for the front desk. */
export async function appointmentsOn(dateAd: string): Promise<AppointmentRow[]> {
  const res = await db().execute({
    sql: `${FULL} WHERE a.date_ad = ? ORDER BY a.time_hhmm ASC, d.name ASC`,
    args: [dateAd],
  });
  return res.rows.map(mapRow);
}

/** One patient's bookings, most recent first. */
export async function appointmentsForPatient(
  patientId: string,
  limit = 20,
): Promise<AppointmentRow[]> {
  const res = await db().execute({
    sql: `${FULL} WHERE a.patient_id = ?
          ORDER BY a.date_ad DESC, a.time_hhmm DESC LIMIT ?`,
    args: [patientId, limit],
  });
  return res.rows.map(mapRow);
}

export interface DoctorDayCount {
  doctorId: string;
  booked: number;
  total: number;
}

/**
 * How many people each doctor has on a given day. Used for the board, so the
 * front desk can see at a glance who is busy without opening five screens.
 */
export async function countsByDoctorOn(
  dateAd: string,
): Promise<Map<string, DoctorDayCount>> {
  const res = await db().execute({
    sql: `SELECT doctor_id,
                 COUNT(*) AS total,
                 SUM(CASE WHEN status IN ('booked','arrived') THEN 1 ELSE 0 END) AS booked
            FROM appointments
           WHERE date_ad = ?
           GROUP BY doctor_id`,
    args: [dateAd],
  });
  const out = new Map<string, DoctorDayCount>();
  for (const r of res.rows) {
    out.set(r.doctor_id as string, {
      doctorId: r.doctor_id as string,
      booked: Number(r.booked ?? 0),
      total: Number(r.total ?? 0),
    });
  }
  return out;
}

/** The next day, on or after `fromAd`, that this doctor has anybody booked. */
export async function nextBusyDay(
  doctorId: string,
  fromAd: string,
): Promise<string | null> {
  const res = await db().execute({
    sql: `SELECT date_ad FROM appointments
           WHERE doctor_id = ? AND date_ad >= ? AND status IN ('booked','arrived')
           ORDER BY date_ad ASC LIMIT 1`,
    args: [doctorId, fromAd],
  });
  return res.rows[0] ? (res.rows[0].date_ad as string) : null;
}

export async function setAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  cancelReason = "",
): Promise<void> {
  await db().execute({
    sql: `UPDATE appointments
             SET status = ?, cancel_reason = ?, updated_at = ?
           WHERE id = ?`,
    args: [status, cancelReason, new Date().toISOString(), id],
  });
}

/** Move a booking to another day or time. The clash rule still applies. */
export async function rescheduleAppointment(
  id: string,
  next: { dateAd: string; dateBs: string; timeHhmm: string; durationMin: number },
): Promise<void> {
  const current = await getAppointment(id);
  if (!current) throw new Error("appointment not found");

  const sameDay = await appointmentsForDoctorOn(current.doctorId, next.dateAd);
  const clash = sameDay.find(
    (a) =>
      a.id !== id &&
      (a.status === "booked" || a.status === "arrived") &&
      overlaps(
        { timeHhmm: a.timeHhmm, durationMin: a.durationMin },
        { timeHhmm: next.timeHhmm, durationMin: next.durationMin },
      ),
  );
  if (clash) throw new DoubleBookedError(clash.patientName);

  await db().execute({
    sql: `UPDATE appointments
             SET date_ad = ?, date_bs = ?, time_hhmm = ?, duration_min = ?,
                 updated_at = ?
           WHERE id = ?`,
    args: [
      next.dateAd,
      next.dateBs,
      next.timeHhmm,
      next.durationMin,
      new Date().toISOString(),
      id,
    ],
  });
}

/** Tie a booking to the visit it became when the person walked in. */
export async function linkAppointmentToVisit(
  id: string,
  visitId: string,
): Promise<void> {
  await db().execute({
    sql: `UPDATE appointments SET visit_id = ?, status = 'arrived', updated_at = ?
           WHERE id = ?`,
    args: [visitId, new Date().toISOString(), id],
  });
}
