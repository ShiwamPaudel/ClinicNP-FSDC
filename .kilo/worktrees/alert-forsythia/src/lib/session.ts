/**
 * session.ts — server-side session & role guards. Use in server components/actions.
 */
import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Role } from "@/lib/repos/users";

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  canEditRate: boolean;
}

/**
 * The Doctor role sees exactly one thing: their own booked consultations, on
 * their own phone. It is not a reduced version of the back office — a doctor
 * has no business on the day close or the stock ledger — so every back-office
 * page sends them to their own screen rather than showing them a stripped one.
 */
export const DOCTOR_HOME = "/my/schedule";

export function isDoctor(role: Role): boolean {
  return role === "doctor";
}

/** Returns the signed-in user or redirects to login. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    role: session.user.role,
    canEditRate: session.user.canEditRate,
  };
}

/**
 * The back office. Everyone signed in belongs here except a doctor, who has
 * their own screen and is sent to it.
 */
export async function requireBackOfficeUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (isDoctor(user.role)) redirect(DOCTOR_HOME);
  return user;
}

/** Returns the signed-in admin or redirects (to login if out, to dashboard if staff). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (isDoctor(user.role)) redirect(DOCTOR_HOME);
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

/**
 * The doctor's own screens. Returns both the sign-in and the doctor it belongs
 * to — a Doctor account with no doctor attached to it can see nothing, which
 * is the safe answer rather than an empty list of somebody else's patients.
 */
export async function requireDoctor(): Promise<{
  user: SessionUser;
  doctorId: string;
}> {
  const user = await requireUser();
  if (!isDoctor(user.role)) redirect("/dashboard");
  const { getDoctorByUserId } = await import("@/lib/repos/doctors");
  const doctor = await getDoctorByUserId(user.id);
  if (!doctor) redirect("/my/not-linked");
  return { user, doctorId: doctor.id };
}

/** Who may create bills, returns and holds: everyone except the Accountant,
 *  who is read-only by definition (PRD §4B.8). */
export function canBill(role: Role): boolean {
  return role === "admin" || role === "staff";
}

/** Who may book, move and cancel a consultation: the front desk and the owner. */
export function canBook(role: Role): boolean {
  return role === "admin" || role === "staff";
}

/** Counter access. An Accountant lands on the dashboard instead. */
export async function requireBillingUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (isDoctor(user.role)) redirect(DOCTOR_HOME);
  if (!canBill(user.role)) redirect("/dashboard");
  return user;
}

/** Reports and registers: Admin and Accountant read every year. */
export function canReadAllYears(role: Role): boolean {
  return role === "admin" || role === "accountant";
}

/** Throws an AuthError-like object for server actions (mapped to plain language). */
export class NotAuthorizedError extends Error {
  code = "not_authorized" as const;
  userMessage = "You don't have permission to do that.";
  constructor() {
    super("not authorized");
  }
}

/** Throws for server actions when the signed-in person may not book. */
export async function assertCanBook(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new NotAuthorizedError();
  if (!canBook(session.user.role)) throw new NotAuthorizedError();
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    role: session.user.role,
    canEditRate: session.user.canEditRate,
  };
}

export async function assertAdmin(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new NotAuthorizedError();
  if (session.user.role !== "admin") throw new NotAuthorizedError();
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    role: session.user.role,
    canEditRate: session.user.canEditRate,
  };
}
