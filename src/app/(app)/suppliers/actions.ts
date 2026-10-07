"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import {
  createSupplier,
  updateSupplier,
  recordSupplierPayment,
} from "@/lib/repos/suppliers";
import { supplierSchema, supplierPaymentSchema } from "@/lib/validators";
import { adToIso, toAD, bsFromDbText, fiscalYearOf } from "@/lib/bs";
import {
  getFiscalYearByLabel,
  assertYearOpen,
  ClosedFiscalYearError,
} from "@/lib/repos/fiscal";
import { recordAudit } from "@/lib/repos/audit";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
  id?: string;
}

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ActionResult {
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  if (err instanceof ClosedFiscalYearError) return fail(err.userMessage);
  console.error("[suppliers action]", err);
  return fail("Something went wrong. Please try again.");
}

export async function saveSupplierAction(input: unknown): Promise<ActionResult> {
  try {
    await requireModule("supplies");
    await assertAdmin();
    const parsed = supplierSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const { id, ...data } = parsed.data;
    if (id) {
      await updateSupplier(id, data);
      revalidatePath(`/suppliers/${id}`);
      revalidatePath("/suppliers");
      return { ok: true, id };
    }
    const newId = await createSupplier(data);
    revalidatePath("/suppliers");
    return { ok: true, id: newId };
  } catch (err) {
    return handle(err);
  }
}

export async function recordPaymentAction(input: unknown): Promise<ActionResult> {
  try {
    await requireModule("supplies");
    const user = await assertAdmin();
    const parsed = supplierPaymentSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const d = parsed.data;

    // The same rule as a laboratory payment (D-029): money is not booked into
    // a year the owner has already closed.
    const bs = bsFromDbText(d.dateBs);
    const year = await getFiscalYearByLabel(fiscalYearOf(bs).label);
    if (year) await assertYearOpen(year.id);

    const paymentId = await recordSupplierPayment({
      supplierId: d.supplierId,
      dateBs: d.dateBs,
      dateAd: adToIso(toAD(bs)),
      amountPaisa: d.amountPaisa,
      method: d.method,
      note: d.note,
      userId: user.id,
    });
    await recordAudit(user.id, "supplier.payment", {
      entity: "supplier",
      entityId: d.supplierId,
      paymentId,
      amountPaisa: d.amountPaisa,
      method: d.method,
      dateBs: d.dateBs,
    });
    revalidatePath(`/suppliers/${d.supplierId}`);
    revalidatePath("/payables");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
