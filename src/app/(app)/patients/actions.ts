"use server";

import { revalidatePath } from "next/cache";
import {
  requireUser,
  assertAdmin,
  NotAuthorizedError,
  canBill,
} from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import {
  createPatient,
  updatePatient,
  findPossibleDuplicates,
  mergePatients,
  setPatientActive,
  PatientNotFoundError,
  MergeError,
  type Sex,
} from "@/lib/repos/patients";
import {
  createVisit,
  updateVisit,
  cancelVisit,
  type VisitType,
  type VisitStatus,
} from "@/lib/repos/visits";
import { softDeleteAttachment } from "@/lib/repos/attachments";
import { recordAudit } from "@/lib/repos/audit";
import { isSaneAge, type AgeUnit } from "@/lib/age";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
}

const OK: ActionResult = { ok: true };

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ActionResult {
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  if (err instanceof PatientNotFoundError) return fail(err.userMessage);
  if (err instanceof MergeError) return fail(err.userMessage);
  console.error("[clinic action]", err);
  return fail("Something went wrong. Please try again.");
}

/** Everyone who works the counter may register a patient; an Accountant can't. */
async function requireClinicWriter() {
  const user = await requireUser();
  await requireModule("clinic");
  if (!canBill(user.role)) throw new NotAuthorizedError();
  return user;
}

export interface PatientFormInput {
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
}

function validate(input: PatientFormInput): string | null {
  if (!input.name.trim()) return "Enter the patient's name.";
  if (!["f", "m", "o"].includes(input.sex)) return "Choose the patient's sex.";
  if (!input.phone.trim()) return "Enter a phone number.";
  if (!input.address.trim()) return "Enter an address.";
  if (input.dobAd == null) {
    if (input.ageValue == null || !input.ageUnit) return "Enter the patient's age.";
    if (!isSaneAge(input.ageValue, input.ageUnit)) {
      return "Check the age — that doesn't look right.";
    }
    if (!input.ageAsOfAd) return "Enter the patient's age.";
  }
  return null;
}

export interface RegisterPatientResult extends ActionResult {
  id?: string;
  patientNo?: number | null;
}

export async function registerPatientAction(
  input: PatientFormInput,
): Promise<RegisterPatientResult> {
  try {
    const user = await requireClinicWriter();
    const problem = validate(input);
    if (problem) return fail(problem);

    const patient = await createPatient({
      ...input,
      // A date of birth wins: the age is then always computed, never stored.
      ageValue: input.dobAd ? null : input.ageValue,
      ageUnit: input.dobAd ? null : input.ageUnit,
      ageAsOfAd: input.dobAd ? null : input.ageAsOfAd,
      userId: user.id,
    });

    revalidatePath("/patients");
    revalidatePath("/visits/today");
    return { ok: true, id: patient.id, patientNo: patient.patientNo };
  } catch (err) {
    return handle(err);
  }
}

export interface DuplicateCheckResult {
  matches: {
    id: string;
    patientNo: number | null;
    name: string;
    phone: string;
    reason: string;
    lastVisitBs: string | null;
  }[];
}

/** Soft warning only. Households share numbers, so this never blocks a save. */
export async function checkDuplicatesAction(
  name: string,
  phone: string,
  excludeId?: string,
): Promise<DuplicateCheckResult> {
  try {
    await requireClinicWriter();
    const matches = await findPossibleDuplicates(name, phone, excludeId);
    return {
      matches: matches.map((m) => ({
        id: m.patient.id,
        patientNo: m.patient.patientNo,
        name: m.patient.name,
        phone: m.patient.phone,
        reason: m.reason,
        lastVisitBs: m.lastVisitBs,
      })),
    };
  } catch {
    // A failed check must never stop someone registering the person in front
    // of them.
    return { matches: [] };
  }
}

export async function updatePatientAction(
  input: PatientFormInput & { id: string },
): Promise<ActionResult> {
  try {
    const user = await requireClinicWriter();
    // Staff may correct their own day's registrations; editing anything older
    // is an Admin job (PRD §4B.8).
    if (user.role !== "admin") {
      const { getPatient } = await import("@/lib/repos/patients");
      const existing = await getPatient(input.id);
      if (!existing) return fail("That patient record no longer exists.");
      const sameDay =
        existing.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10);
      if (!sameDay) {
        return fail("Ask an owner to change this patient's details.");
      }
    }

    const problem = validate(input);
    if (problem) return fail(problem);

    await updatePatient({
      ...input,
      ageValue: input.dobAd ? null : input.ageValue,
      ageUnit: input.dobAd ? null : input.ageUnit,
      ageAsOfAd: input.dobAd ? null : input.ageAsOfAd,
    });
    await recordAudit(user.id, "patient.edited", { patientId: input.id });

    revalidatePath(`/patients/${input.id}`);
    revalidatePath("/patients");
    return OK;
  } catch (err) {
    return handle(err);
  }
}

export async function setPatientActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    const user = await assertAdmin();
    await requireModule("clinic");
    await setPatientActive(id, active);
    await recordAudit(user.id, "patient.deactivated", { patientId: id, active });
    revalidatePath(`/patients/${id}`);
    return OK;
  } catch (err) {
    return handle(err);
  }
}

export async function mergePatientsAction(
  keepId: string,
  mergeId: string,
): Promise<ActionResult> {
  try {
    const user = await assertAdmin();
    await requireModule("clinic");
    await mergePatients(keepId, mergeId, user.id);
    revalidatePath("/patients");
    revalidatePath(`/patients/${keepId}`);
    return OK;
  } catch (err) {
    return handle(err);
  }
}

// ---- visits ----

export interface StartVisitInput {
  patientId: string;
  dateAd: string;
  dateBs: string;
  type: VisitType;
  department?: string;
  complaint?: string;
}

export interface StartVisitResult extends ActionResult {
  id?: string;
}

export async function startVisitAction(
  input: StartVisitInput,
): Promise<StartVisitResult> {
  try {
    const user = await requireClinicWriter();
    const visit = await createVisit({ ...input, userId: user.id });
    revalidatePath("/visits/today");
    revalidatePath(`/patients/${input.patientId}`);
    return { ok: true, id: visit.id };
  } catch (err) {
    return handle(err);
  }
}

export interface UpdateVisitFormInput {
  id: string;
  patientId: string;
  type?: VisitType;
  department?: string;
  complaint?: string;
  findings?: string;
  advice?: string;
  status?: Exclude<VisitStatus, "cancelled">;
  vitals?: {
    bp?: string;
    pulse?: number | null;
    tempC?: number | null;
    weightKg?: number | null;
    spo2?: number | null;
  };
}

export async function updateVisitAction(
  input: UpdateVisitFormInput,
): Promise<ActionResult> {
  try {
    await requireClinicWriter();
    await updateVisit(input);
    revalidatePath(`/visits/${input.id}`);
    revalidatePath("/visits/today");
    revalidatePath(`/patients/${input.patientId}`);
    return OK;
  } catch (err) {
    return handle(err);
  }
}

export async function cancelVisitAction(
  id: string,
  reason: string,
  patientId: string,
): Promise<ActionResult> {
  try {
    const user = await assertAdmin();
    await requireModule("clinic");
    if (!reason.trim()) return fail("Say why this visit is being cancelled.");
    await cancelVisit(id, reason, user.id);
    revalidatePath(`/visits/${id}`);
    revalidatePath("/visits/today");
    revalidatePath(`/patients/${patientId}`);
    return OK;
  } catch (err) {
    return handle(err);
  }
}

/** Deleting a file is Admin-only and audit-logged (PRD §4B.6). */
export async function deleteAttachmentAction(
  id: string,
  patientId: string,
): Promise<ActionResult> {
  try {
    const user = await assertAdmin();
    await requireModule("clinic");
    await softDeleteAttachment(id, user.id);
    revalidatePath(`/patients/${patientId}`);
    revalidatePath("/files/pending");
    return OK;
  } catch (err) {
    return handle(err);
  }
}
