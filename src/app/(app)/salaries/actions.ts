"use server";

/**
 * Staff and their salaries (C-037). Owner only: what people are paid is not
 * for the front desk.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import {
  createStaff,
  updateStaff,
  setPayRate,
  addSalaryLine,
  paySalary,
  giveAdvance,
  undoSalaryEntry,
  getStaff,
  PayrollError,
} from "@/lib/repos/payroll";
import { adToIso, bsFromDbText, toAD } from "@/lib/bs";

export interface SalaryActionResult {
  ok: boolean;
  userMessage?: string;
  id?: string;
}

const fail = (userMessage: string): SalaryActionResult => ({ ok: false, userMessage });

function handle(err: unknown): SalaryActionResult {
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  if (err instanceof PayrollError) return fail(err.userMessage);
  console.error("[salaries action]", err);
  return fail("Something went wrong. Please try again.");
}

const dateBs = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const monthBs = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month");
const method = z.enum(["cash", "bank", "cheque", "qr"]);

const staffSchema = z.object({
  name: z.string().trim().min(1, "Enter the name").max(120),
  designation: z.string().max(80),
  phone: z.string().max(40),
  panNo: z.string().max(30),
  ssfNo: z.string().max(30),
  bankAccount: z.string().max(80),
  note: z.string().max(500),
  joinedBs: dateBs.nullable(),
  leftBs: dateBs.nullable(),
});

const rateSchema = z.object({
  fromMonthBs: monthBs,
  monthlySalaryPaisa: z.number().int().min(0, "Enter the salary"),
  ssfEnrolled: z.boolean(),
  sstApplies: z.boolean(),
});

const adToday = (bs: string) => adToIso(toAD(bsFromDbText(bs)));

function touch(staffId?: string) {
  revalidatePath("/salaries");
  revalidatePath("/salaries/staff");
  if (staffId) revalidatePath(`/salaries/staff/${staffId}`);
}

export async function saveStaffAction(input: unknown): Promise<SalaryActionResult> {
  try {
    const user = await assertAdmin();
    const parsed = z
      .object({ id: z.string().optional(), staff: staffSchema, rate: rateSchema.optional() })
      .safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    const { id, staff, rate } = parsed.data;
    if (staff.joinedBs && staff.leftBs && staff.leftBs < staff.joinedBs) {
      return fail("The leaving date is before the joining date.");
    }
    if (id) {
      if (!(await getStaff(id))) return fail("That person is no longer on the list.");
      await updateStaff(id, staff);
      touch(id);
      return { ok: true, id };
    }
    if (!rate) return fail("Enter the salary.");
    const newId = await createStaff(staff, rate, user.id);
    touch(newId);
    return { ok: true, id: newId };
  } catch (err) {
    return handle(err);
  }
}

export async function setPayRateAction(input: unknown): Promise<SalaryActionResult> {
  try {
    const user = await assertAdmin();
    const parsed = rateSchema.extend({ staffId: z.string().min(1) }).safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    const { staffId, ...rate } = parsed.data;
    if (!(await getStaff(staffId))) return fail("That person is no longer on the list.");
    await setPayRate(staffId, rate, user.id);
    touch(staffId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function addSalaryLineAction(input: unknown): Promise<SalaryActionResult> {
  try {
    const user = await assertAdmin();
    const parsed = z
      .object({
        staffId: z.string().min(1),
        monthBs,
        kind: z.enum(["bonus", "deduction"]),
        label: z.string().trim().min(1, "Say what it is for").max(120),
        amountPaisa: z.number().int().min(1, "Enter an amount"),
      })
      .safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    await addSalaryLine({ ...parsed.data, userId: user.id });
    touch(parsed.data.staffId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function paySalaryAction(input: unknown): Promise<SalaryActionResult> {
  try {
    const user = await assertAdmin();
    const parsed = z
      .object({
        staffId: z.string().min(1),
        monthBs,
        dateBs,
        amountPaisa: z.number().int().min(0),
        method,
        note: z.string().max(300),
        recoverAdvancePaisa: z.number().int().min(0),
      })
      .safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    const d = parsed.data;
    await paySalary({ ...d, dateAd: adToday(d.dateBs), userId: user.id });
    touch(d.staffId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function giveAdvanceAction(input: unknown): Promise<SalaryActionResult> {
  try {
    const user = await assertAdmin();
    const parsed = z
      .object({
        staffId: z.string().min(1),
        dateBs,
        amountPaisa: z.number().int().min(1, "Enter an amount"),
        method,
        note: z.string().max(300),
      })
      .safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    const d = parsed.data;
    await giveAdvance({ ...d, dateAd: adToday(d.dateBs), userId: user.id });
    touch(d.staffId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function undoSalaryEntryAction(input: unknown): Promise<SalaryActionResult> {
  try {
    const user = await assertAdmin();
    const parsed = z
      .object({
        kind: z.enum(["payment", "line"]),
        id: z.string().min(1),
        reason: z.string().trim().min(1, "Say why this is being undone"),
      })
      .safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    const res = await undoSalaryEntry({ ...parsed.data, userId: user.id });
    touch(res.staffId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
