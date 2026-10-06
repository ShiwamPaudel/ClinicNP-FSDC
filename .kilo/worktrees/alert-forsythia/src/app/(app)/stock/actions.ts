"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { getBatch } from "@/lib/repos/batches";
import {
  createStockOut,
  InvalidAdjustmentError,
  AdjustmentShortError,
} from "@/lib/repos/adjustments";
import { adToIso, toAD, bsFromDbText, today, bsToDbText } from "@/lib/bs";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
}

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ActionResult {
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  if (err instanceof InvalidAdjustmentError) return fail(err.userMessage);
  if (err instanceof AdjustmentShortError) return fail(err.userMessage);
  console.error("[stock action]", err);
  return fail("Something went wrong. Please try again.");
}

function refreshStockScreens(): void {
  revalidatePath("/stock/expired");
  revalidatePath("/stock");
  revalidatePath("/stock/out");
  revalidatePath("/suppliers");
}

function todayDates() {
  const bs = bsToDbText(today());
  return { dateBs: bs, dateAd: adToIso(toAD(bsFromDbText(bs))) };
}

/**
 * Dispose of an expired batch's remaining stock. Admin only.
 *
 * Routed through createStockOut so there is ONE stock-out path, not two: this
 * now lands in the stock-out register with reason "disposed", carries a proper
 * number, and prints a note like any other entry (Phases.md Phase 1).
 */
export async function writeOffBatchAction(
  batchId: string,
  note?: string,
): Promise<ActionResult> {
  try {
    await requireModule("pharmacy");
    const user = await assertAdmin();
    const batch = await getBatch(batchId);
    if (!batch) return fail("That batch no longer exists.");
    if (batch.remainingBaseQty <= 0) return fail("Nothing left to write off.");

    const { dateBs, dateAd } = todayDates();
    await createStockOut({
      direction: "out",
      reason: "disposed",
      dateAd,
      dateBs,
      note: note ?? "",
      lines: [
        {
          itemId: batch.itemId,
          batchId: batch.id,
          baseQty: batch.remainingBaseQty,
          unitLevelEntered: 0,
          qtyEntered: batch.remainingBaseQty,
        },
      ],
      userId: user.id,
    });

    refreshStockScreens();
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

/**
 * Send an expired batch back to its supplier. Admin only.
 *
 * Also routed through createStockOut, which creates the real purchase return
 * and credits the supplier ledger — one code path for both.
 */
export async function returnExpiredBatchAction(
  batchId: string,
): Promise<ActionResult> {
  try {
    await requireModule("pharmacy");
    const user = await assertAdmin();
    const batch = await getBatch(batchId);
    if (!batch) return fail("That batch no longer exists.");
    if (batch.remainingBaseQty <= 0) return fail("Nothing left to return.");
    if (!batch.supplierId) return fail("This batch has no supplier on record.");

    const { dateBs, dateAd } = todayDates();
    await createStockOut({
      direction: "out",
      reason: "returned_to_supplier",
      dateAd,
      dateBs,
      supplierId: batch.supplierId,
      note: "Expired stock returned",
      lines: [
        {
          itemId: batch.itemId,
          batchId: batch.id,
          baseQty: batch.remainingBaseQty,
          unitLevelEntered: 0,
          qtyEntered: batch.remainingBaseQty,
        },
      ],
      userId: user.id,
    });

    refreshStockScreens();
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
