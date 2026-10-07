"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { voidPayment, PaymentError } from "@/lib/repos/payables";
import { paymentVoidSchema } from "@/lib/validators";

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
    } else {
      revalidatePath("/reports/lab-partners");
      revalidatePath("/settings/lab-partners");
    }
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
