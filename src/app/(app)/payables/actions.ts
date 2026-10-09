"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { voidPayment, PaymentError } from "@/lib/repos/payables";
import { recordDoctorPayout } from "@/lib/repos/doctor-pay";
import { getDoctor } from "@/lib/repos/doctors";
import {
  getFiscalYearByLabel,
  assertYearOpen,
  ClosedFiscalYearError,
} from "@/lib/repos/fiscal";
import { adToIso, bsFromDbText, fiscalYearOf, toAD } from "@/lib/bs";
import { paymentVoidSchema, doctorPayoutSchema } from "@/lib/validators";

export interface PayablesActionResult {
  ok: boolean;
  userMessage?: string;
}

function fail(userMessage: string): PayablesActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): PayablesActionResult {
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  if (err instanceof PaymentError) return fail(err.userMessage);
  if (err instanceof ClosedFiscalYearError) return fail(err.userMessage);
  console.error("[payables action]", err);
  return fail("Something went wrong. Please try again.");
}

/**
 * Undo a payment to a supplier or a laboratory that was entered by mistake.
 * Owner only, with a reason, and only while its year is open. The payment
 * stays on file, marked; the amount is owed again.
 */
export async function voidPaymentAction(input: unknown): Promise<PayablesActionResult> {
  try {
    const user = await assertAdmin();
    const parsed = paymentVoidSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const d = parsed.data;
    await requireModule(d.kind === "supplier" ? "supplies" : "clinic");

    const res = await voidPayment({
      kind: d.kind,
      paymentId: d.paymentId,
      reason: d.reason,
      userId: user.id,
    });

    revalidatePath("/payables");
    if (d.kind === "supplier") {
      revalidatePath(`/suppliers/${res.partyId}`);
      revalidatePath("/suppliers");
      if (res.purchaseId) revalidatePath(`/purchases/${res.purchaseId}`);
    } else if (d.kind === "doctor") {
      revalidatePath("/reports/doctors");
    } else {
      revalidatePath("/reports/lab-partners");
      revalidatePath("/settings/lab-partners");
    }
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

/**
 * Pay a doctor some or all of the share they are owed (C-037). The payout is
 * not for any bill in particular: it clears the oldest unpaid shares first,
 * worked out whenever the statement is read. More than is owed is kept as
 * paid ahead.
 */
export async function recordDoctorPayoutAction(input: unknown): Promise<PayablesActionResult> {
  try {
    const user = await assertAdmin();
    await requireModule("clinic");
    const parsed = doctorPayoutSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const d = parsed.data;
    const doctor = await getDoctor(d.doctorId);
    if (!doctor) return fail("That doctor is no longer listed.");

    // A payment in a year that has closed would change signed-off figures.
    const bs = bsFromDbText(d.dateBs);
    const year = await getFiscalYearByLabel(fiscalYearOf(bs).label);
    if (year) await assertYearOpen(year.id);

    await recordDoctorPayout({
      doctorId: d.doctorId,
      dateAd: adToIso(toAD(bs)),
      dateBs: d.dateBs,
      amountPaisa: d.amountPaisa,
      method: d.method,
      note: d.note,
      userId: user.id,
    });
    revalidatePath("/payables");
    revalidatePath("/reports/doctors");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
