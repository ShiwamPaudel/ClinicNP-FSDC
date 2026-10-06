/**
 * doctors.ts — the people whose names go on a slip and who take a share.
 *
 * A doctor is still not a login. Most never get one. But a doctor who wants to
 * see their own booked consultations on their phone is given a user account
 * with the Doctor role, and `user_id` is the thread between the two: the
 * account they sign in with, and the doctor whose list they then see.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import type { ShareBasis } from "@/lib/clinic-calc";

export interface Doctor {
  id: string;
  name: string;
  qualification: string;
  specialty: string;
  nmcNo: string;
  phone: string;
  shareBasis: ShareBasis;
  /** Basis points for the percentage bases, paisa for fixed_consult. */
  shareValue: number;
  active: boolean;
  /** Where a booking alert is emailed. Empty means no email goes out. */
  email: string;
  /** The login that belongs to this doctor, or null if they have none. */
  userId: string | null;
  notifyPush: boolean;
  notifyEmail: boolean;
}

export interface DoctorInput {
  name: string;
  qualification: string;
  specialty: string;
  nmcNo: string;
  phone: string;
  shareBasis: ShareBasis;
  shareValue: number;
  active: boolean;
  email: string;
  userId: string | null;
  notifyPush: boolean;
  notifyEmail: boolean;
}

function mapDoctor(r: Row): Doctor {
  return {
    id: r.id as string,
    name: r.name as string,
    qualification: r.qualification as string,
    specialty: r.specialty as string,
    nmcNo: r.nmc_no as string,
    phone: r.phone as string,
    shareBasis: r.share_basis as ShareBasis,
    shareValue: Number(r.share_value),
    active: Number(r.active) === 1,
    email: (r.email as string) ?? "",
    userId: (r.user_id as string | null) ?? null,
    notifyPush: Number(r.notify_push ?? 1) === 1,
    notifyEmail: Number(r.notify_email ?? 1) === 1,
  };
}

export async function listDoctors(includeInactive = false): Promise<Doctor[]> {
  const sql = includeInactive
    ? "SELECT * FROM doctors ORDER BY active DESC, name ASC"
    : "SELECT * FROM doctors WHERE active = 1 ORDER BY name ASC";
  const res = await db().execute(sql);
  return res.rows.map(mapDoctor);
}

export async function getDoctor(id: string): Promise<Doctor | null> {
  const res = await db().execute({
    sql: "SELECT * FROM doctors WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? mapDoctor(res.rows[0]) : null;
}

export async function createDoctor(input: DoctorInput): Promise<string> {
  const id = ulid();
  const now = new Date().toISOString();
  await db().execute({
    sql: `INSERT INTO doctors
            (id, name, qualification, specialty, nmc_no, phone,
             share_basis, share_value, active, email, user_id,
             notify_push, notify_email, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.name,
      input.qualification,
      input.specialty,
      input.nmcNo,
      input.phone,
      input.shareBasis,
      input.shareValue,
      input.active ? 1 : 0,
      input.email,
      input.userId,
      input.notifyPush ? 1 : 0,
      input.notifyEmail ? 1 : 0,
      now,
      now,
    ],
  });
  return id;
}

/**
 * Editing a doctor changes what they earn from here on. It never moves money
 * already earned: every bill line carries its own snapshot of the basis and
 * value that were in force when it was billed.
 */
export async function updateDoctor(id: string, input: DoctorInput): Promise<void> {
  await db().execute({
    sql: `UPDATE doctors
             SET name = ?, qualification = ?, specialty = ?, nmc_no = ?, phone = ?,
                 share_basis = ?, share_value = ?, active = ?, email = ?,
                 user_id = ?, notify_push = ?, notify_email = ?, updated_at = ?
           WHERE id = ?`,
    args: [
      input.name,
      input.qualification,
      input.specialty,
      input.nmcNo,
      input.phone,
      input.shareBasis,
      input.shareValue,
      input.active ? 1 : 0,
      input.email,
      input.userId,
      input.notifyPush ? 1 : 0,
      input.notifyEmail ? 1 : 0,
      new Date().toISOString(),
      id,
    ],
  });
}

/** The doctor a signed-in Doctor account belongs to, or null if none does. */
export async function getDoctorByUserId(userId: string): Promise<Doctor | null> {
  const res = await db().execute({
    sql: "SELECT * FROM doctors WHERE user_id = ?",
    args: [userId],
  });
  return res.rows[0] ? mapDoctor(res.rows[0]) : null;
}

/**
 * What a doctor may change about themselves from their own phone.
 *
 * Deliberately narrow: their name, letters, what they are called, their
 * council number, how to reach them, and whether they want to be told. What
 * they earn is not on this list — that is between them and the owner, and it
 * is set in Settings.
 */
export interface DoctorProfilePatch {
  name: string;
  qualification: string;
  specialty: string;
  nmcNo: string;
  phone: string;
  email: string;
  notifyPush: boolean;
  notifyEmail: boolean;
}

export async function updateDoctorProfile(
  id: string,
  patch: DoctorProfilePatch,
): Promise<void> {
  await db().execute({
    sql: `UPDATE doctors
             SET name = ?, qualification = ?, specialty = ?, nmc_no = ?,
                 phone = ?, email = ?, notify_push = ?, notify_email = ?,
                 updated_at = ?
           WHERE id = ?`,
    args: [
      patch.name,
      patch.qualification,
      patch.specialty,
      patch.nmcNo,
      patch.phone,
      patch.email,
      patch.notifyPush ? 1 : 0,
      patch.notifyEmail ? 1 : 0,
      new Date().toISOString(),
      id,
    ],
  });
}

/** Is this login already claimed by a different doctor? */
export async function userIdTaken(
  userId: string,
  exceptDoctorId: string | null,
): Promise<boolean> {
  const res = await db().execute({
    sql: `SELECT 1 FROM doctors
           WHERE user_id = ? AND (? IS NULL OR id <> ?) LIMIT 1`,
    args: [userId, exceptDoctorId, exceptDoctorId],
  });
  return res.rows.length > 0;
}
