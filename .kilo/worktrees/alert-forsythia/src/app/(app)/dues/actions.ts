"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { canBill, assertAdmin, NotAuthorizedError } from "@/lib/session";
import { receiveDuePayment, voidDueReceipt } from "@/lib/repos/dues";
import { ClosedFiscalYearError } from "@/lib/repos/fiscal";
import { DuePaymentError } from "@/lib/dues";
import { adToIso, toAD, bsToDbText, today } from "@/lib/bs";

export interface DuesActionResult {
  ok: boolean;
  userMessage?: string;
  /** what the person still owes on those bills afterwards */
  stillOwedPaisa?: number;
  amountPaisa?: number;
}

function fail(userMessage: string): DuesActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): DuesActionResult {
  // Only sentences written for a screen reach one (Rules §1c).
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  if (err instanceof DuePaymentError) return fail(err.userMessage);
  if (err instanceof ClosedFiscalYearError) return fail(err.userMessage);
  console.error("[dues action]", err);
  return fail("Something went wrong. Please try again.");
}

function refresh(billIds: string[]) {
  revalidatePath("/dues");
  revalidatePath("/bills");
  revalidatePath("/dashboard");
  revalidatePath("/reports/day-close");
  for (const id of billIds) revalidatePath(`/bills/${id}`);
}

const receiveSchema = z.object({
  receiptId: z.string().min(10).max(40),
  billIds: z.array(z.string().min(1)).min(1).max(200),
  amountPaisa: z.number().int().min(1, "Enter how much was paid."),
  method: z.enum(["cash", "qr"]),
  note: z.string().max(200).default(""),
});

/**
 * Money received against dues. Anyone who can take money at the counter can
 * take it here too; the Accountant reads but never records.
 */
export async function receiveDuesAction(
  input: unknown,
): Promise<DuesActionResult> {
  try {
    const session = await auth();
    if (!session?.user || !canBill(session.user.role)) {
      throw new NotAuthorizedError();
    }
    const parsed = receiveSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    // Recorded on the day it arrives. The date is the server's, not the
    // screen's, so a payment can never be put on a day already counted.
    const bs = today();
    const res = await receiveDuePayment({
      ...parsed.data,
      dateBs: bsToDbText(bs),
      dateAd: adToIso(toAD(bs)),
      userId: session.user.id,
    });
    refresh(parsed.data.billIds);
    return {
      ok: true,
      stillOwedPaisa: res.stillOwedPaisa,
      amountPaisa: res.allocations.reduce((s, a) => s + a.amountPaisa, 0),
    };
  } catch (err) {
    return handle(err);
  }
}

/** Undo a payment entered by mistake. Owner only, and only in the open year. */
export async function voidDueReceiptAction(
  receiptId: string,
  billIds: string[],
): Promise<DuesActionResult> {
  try {
    const admin = await assertAdmin();
    if (typeof receiptId !== "string" || receiptId.length === 0) {
      return fail("That payment is not there any more.");
    }
    const res = await voidDueReceipt(receiptId, admin.id);
    refresh(Array.isArray(billIds) ? billIds.filter((x) => typeof x === "string") : []);
    return { ok: true, amountPaisa: res.amountPaisa };
  } catch (err) {
    return handle(err);
  }
}
