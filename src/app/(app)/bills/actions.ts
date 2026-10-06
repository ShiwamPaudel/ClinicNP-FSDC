"use server";

import { revalidatePath } from "next/cache";
import {
  assertAdmin,
  requireUser,
  NotAuthorizedError,
} from "@/lib/session";
import { cancelBill } from "@/lib/repos/bills";
import { createSaleReturn } from "@/lib/repos/sale-returns";
import { adToIso, toAD, bsFromDbText, bsToDbText, today } from "@/lib/bs";
import { z } from "zod";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
  returnNo?: number;
  /** Set when the original bill's year was closed and this went into the open one. */
  intoOpenYearNote?: string;
  /** of a return: what came off the patient's dues, and what was handed back */
  againstDuePaisa?: number;
  handBackPaisa?: number;
}

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ActionResult {
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  console.error("[bills action]", err);
  return fail("Something went wrong. Please try again.");
}

export async function cancelBillAction(id: string): Promise<ActionResult> {
  try {
    const admin = await assertAdmin();
    await cancelBill(id, admin.id);
    revalidatePath(`/bills/${id}`);
    revalidatePath("/bills");
    // a cancelled bill owes nothing, so it leaves the dues list
    revalidatePath("/dues");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

const saleReturnSchema = z
  .object({
    billId: z.string().min(1),
    lines: z.array(
      z.object({
        billLineId: z.string().min(1),
        itemId: z.string().min(1),
        returnBaseQty: z.number().int().min(1),
        amountPaisa: z.number().int().min(0),
      }),
    ),
    serviceLines: z
      .array(
        z.object({
          billServiceLineId: z.string().min(1),
          qty: z.number().int().min(1),
          amountPaisa: z.number().int().min(0),
        }),
      )
      .optional(),
  })
  // Either kind alone is a real refund: a returned medicine, or a service
  // that was charged for and should not have been.
  .refine(
    (r) => r.lines.length > 0 || (r.serviceLines?.length ?? 0) > 0,
    { message: "Choose what is being given back", path: ["lines"] },
  );

export async function createSaleReturnAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = saleReturnSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const bs = bsToDbText(today());
    const res = await createSaleReturn({
      billId: parsed.data.billId,
      dateBs: bs,
      dateAd: adToIso(toAD(bsFromDbText(bs))),
      lines: parsed.data.lines,
      serviceLines: parsed.data.serviceLines,
      userId: user.id,
    });
    revalidatePath(`/bills/${parsed.data.billId}`);
    revalidatePath("/bills");
    revalidatePath("/reports/service-revenue");
    if (res.againstDuePaisa > 0) revalidatePath("/dues");
    return {
      ok: true,
      returnNo: res.returnNo,
      intoOpenYearNote: res.intoOpenYearNote,
      againstDuePaisa: res.againstDuePaisa,
      handBackPaisa: res.handBackPaisa,
    };
  } catch (err) {
    return handle(err);
  }
}
