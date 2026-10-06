"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError, getModules } from "@/lib/modules";
import {
  createStockOut,
  reasonSpec,
  InvalidAdjustmentError,
  AdjustmentShortError,
  type StockOutReason,
  type AdjustmentDirection,
  type StockOutLineInput,
} from "@/lib/repos/adjustments";

export interface StockOutActionResult {
  ok: boolean;
  userMessage?: string;
  id?: string;
  adjustmentNo?: number;
}

function fail(userMessage: string): StockOutActionResult {
  return { ok: false, userMessage };
}

/** Map any thrown error to a safe, plain-language result (Rules §4). */
function handle(err: unknown): StockOutActionResult {
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  if (err instanceof InvalidAdjustmentError) return fail(err.userMessage);
  if (err instanceof AdjustmentShortError) return fail(err.userMessage);
  console.error("[stock out]", err);
  return fail("Something went wrong. Please try again.");
}

export interface RecordStockOutInput {
  direction: AdjustmentDirection;
  reason: StockOutReason;
  dateAd: string;
  dateBs: string;
  supplierId?: string | null;
  note?: string;
  lines: StockOutLineInput[];
}

/** Record a stock-out. Admin only; Staff can read the register but not create. */
export async function recordStockOutAction(
  input: RecordStockOutInput,
): Promise<StockOutActionResult> {
  try {
    const user = await assertAdmin();
    await requireModule("pharmacy");

    // "Used in the clinic" only exists when the clinic module is on, and the
    // guard is here rather than only on the screen.
    const spec = reasonSpec(input.reason);
    if (spec.clinicOnly) {
      const modules = await getModules();
      if (!modules.clinic) return fail("That reason isn't available.");
    }

    const res = await createStockOut({ ...input, userId: user.id });

    revalidatePath("/stock");
    revalidatePath("/stock/out");
    revalidatePath("/stock/expired");
    revalidatePath("/stock/low");
    revalidatePath("/suppliers");

    return { ok: true, id: res.id, adjustmentNo: res.adjustmentNo };
  } catch (err) {
    return handle(err);
  }
}
