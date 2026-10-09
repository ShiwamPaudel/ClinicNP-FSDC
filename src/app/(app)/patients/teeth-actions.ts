"use server";

/**
 * The tooth chart (C-037). Anyone who treats or books patients may mark a
 * tooth — the front desk, the owner, and doctors with their own login. An
 * Accountant may not.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { getPatient } from "@/lib/repos/patients";
import { addToothRecords, undoToothRecord } from "@/lib/repos/teeth";
import { cleanSurfaces, isCondition, isTooth } from "@/lib/teeth";
import { adFromIso, adToIso, bsFromDbText, bsToDbText, toAD, toBS } from "@/lib/bs";
import { nepalDayIso } from "@/lib/clock";

export interface TeethActionResult {
  ok: boolean;
  userMessage?: string;
}

const fail = (userMessage: string): TeethActionResult => ({ ok: false, userMessage });

async function guard() {
  const user = await requireUser();
  await requireModule("clinic");
  if (user.role === "accountant") throw new NotAuthorizedError();
  return user;
}

function handle(err: unknown): TeethActionResult {
  if (err instanceof ModuleDisabledError || err instanceof NotAuthorizedError) {
    return fail(err.userMessage);
  }
  console.error("[teeth action]", err);
  return fail("Something went wrong. Please try again.");
}

export async function addToothRecordAction(input: unknown): Promise<TeethActionResult> {
  try {
    const user = await guard();
    const parsed = z
      .object({
        patientId: z.string().min(1),
        teeth: z.array(z.number().int()).min(1, "Choose a tooth").max(32),
        condition: z.string().min(1),
        surfaces: z.string().max(10),
        note: z.string().max(1000),
        dateBs: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
      })
      .safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    const d = parsed.data;
    if (!d.teeth.every(isTooth)) return fail("That is not a tooth on the chart.");
    if (!isCondition(d.condition)) return fail("Choose what the tooth is.");
    const todayBs = bsToDbText(toBS(adFromIso(nepalDayIso(new Date().toISOString()))));
    if (d.dateBs > todayBs) return fail("The date can't be in the future.");
    const patient = await getPatient(d.patientId);
    if (!patient || patient.mergedIntoId) return fail("That patient is no longer on file.");

    await addToothRecords({
      patientId: d.patientId,
      teeth: [...new Set(d.teeth)],
      condition: d.condition,
      surfaces: cleanSurfaces(d.surfaces),
      note: d.note,
      dateBs: d.dateBs,
      dateAd: adToIso(toAD(bsFromDbText(d.dateBs))),
      userId: user.id,
    });
    revalidatePath(`/patients/${d.patientId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function undoToothRecordAction(id: string): Promise<TeethActionResult> {
  try {
    const user = await guard();
    const patientId = await undoToothRecord(id, user.id);
    if (!patientId) return fail("That mark is not there any more.");
    revalidatePath(`/patients/${patientId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
