"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { getItem } from "@/lib/repos/items";
import {
  createPurchase,
  createPurchaseReturn,
  updatePurchase,
  PurchaseEditError,
  type PurchaseLineInput,
  type PurchaseUpdateLineInput,
} from "@/lib/repos/purchases";
import { getUserById, verifyCredentials } from "@/lib/repos/users";
import {
  checkLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
} from "@/lib/repos/security";
import {
  purchaseSchema,
  purchaseReturnSchema,
  purchaseUpdateSchema,
  type PurchaseFormInput,
} from "@/lib/validators";
import { adToIso, toAD, bsFromDbText } from "@/lib/bs";
import { vatOf } from "@/lib/money";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
  id?: string;
  purchaseNo?: string;
}

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ActionResult {
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  if (err instanceof PurchaseEditError) return fail(err.userMessage);
  console.error("[purchases action]", err);
  return fail("Something went wrong. Please try again.");
}

function bsToAdIso(bsText: string): string {
  return adToIso(toAD(bsFromDbText(bsText)));
}

/**
 * Turn the form's lines into repository lines, and work out the VAT.
 *
 * Shared by a new purchase and an edited one so the two can never disagree
 * about what a line means. Unit factors are resolved here, on the server, and
 * never taken from the browser.
 */
async function resolveLines(
  d: PurchaseFormInput,
): Promise<{ lines: PurchaseUpdateLineInput[]; vatPaisa: number } | { error: string }> {
  const lines: PurchaseUpdateLineInput[] = [];
  for (const l of d.lines) {
    // Resolve factorToBase server-side (don't trust the client).
    const item = await getItem(l.itemId);
    if (!item) return { error: "One of the items no longer exists." };
    const unit = item.units.find((u) => u.level === l.unitLevel);
    if (!unit) return { error: "Pick a valid unit for each line." };
    lines.push({
      lineId: l.lineId,
      itemId: l.itemId,
      batchNo: l.batchNo,
      mfgDateAd: l.mfgDateBs ? bsToAdIso(l.mfgDateBs) : null,
      expiryDateAd: bsToAdIso(l.expiryDateBs),
      unitLevel: l.unitLevel,
      factorToBase: unit.factorToBase,
      qty: l.qty,
      freeQty: l.freeQty,
      unitCostPaisa: l.unitCostPaisa,
      discountPaisa: l.discountPaisa,
      sellingRatePaisa: l.sellingRatePaisa,
    });
  }

  const netSubtotal = lines.reduce(
    (s, l) => s + l.qty * l.unitCostPaisa - l.discountPaisa,
    0,
  );
  // The supplier's own order: lines, then the discount on the whole bill,
  // then VAT on what is left (D-143). Every invoice from Family Smile Dental Care Center's
  // distributors reads this way — "Discount", then "Taxable Amount",
  // then "VAT".
  if (d.billDiscountPaisa > netSubtotal) {
    return {
      error: "The discount is more than the bill. Check the discount against the invoice.",
    };
  }
  const taxable = netSubtotal - d.billDiscountPaisa;
  const vatPaisa = d.applyVat ? vatOf(taxable) : 0;
  return { lines, vatPaisa };
}

export async function createPurchaseAction(input: unknown): Promise<ActionResult> {
  try {
    await requireModule("pharmacy");
    const user = await assertAdmin();
    const parsed = purchaseSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const d = parsed.data;

    const resolved = await resolveLines(d);
    if ("error" in resolved) return fail(resolved.error);
    // A new purchase has no existing lines, whatever the browser sent.
    const lines: PurchaseLineInput[] = resolved.lines.map(
      ({ lineId: _ignored, ...l }) => l,
    );

    const res = await createPurchase({
      supplierId: d.supplierId,
      supplierInvoiceNo: d.supplierInvoiceNo,
      dateBs: d.dateBs,
      dateAd: bsToAdIso(d.dateBs),
      vatPaisa: resolved.vatPaisa,
      billDiscountPaisa: d.billDiscountPaisa,
      roundingPaisa: d.roundingPaisa,
      lines,
      userId: user.id,
      // "On credit" is no payment at all, exactly as before (0023).
      payment:
        d.payment && d.payment.mode !== "credit"
          ? {
              mode: d.payment.mode,
              amountPaisa: d.payment.amountPaisa,
              method: d.payment.method,
            }
          : undefined,
    });

    revalidatePath("/purchases");
    revalidatePath("/stock");
    revalidatePath("/items");
    if (res.paidPaisa > 0) {
      revalidatePath("/payables");
      revalidatePath(`/suppliers/${d.supplierId}`);
    }
    return { ok: true, id: res.id, purchaseNo: res.purchaseNo };
  } catch (err) {
    return handle(err);
  }
}

/**
 * Save a change to a purchase, once the signed-in admin has typed their
 * password again.
 *
 * The password is checked here, at the moment of the write, not when the edit
 * screen opens: that way there is no unlocked state to leave lying around on a
 * shared counter machine, and nothing is saved without it. Wrong attempts are
 * throttled exactly like the sign-in screen, but on a bucket of their own so a
 * slip here cannot lock anybody out of signing in.
 */
export async function updatePurchaseAction(input: unknown): Promise<ActionResult> {
  try {
    await requireModule("pharmacy");
    const user = await assertAdmin();
    const parsed = purchaseUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const d = parsed.data;

    // --- the password ---
    const ident = `purchase-edit:${user.id}`;
    const gate = await checkLoginAllowed(ident);
    if (!gate.allowed) {
      const mins = Math.max(1, Math.ceil(gate.retryAfterSec / 60));
      return fail(
        `Too many wrong passwords. Wait about ${mins} minute${mins === 1 ? "" : "s"} and try again.`,
      );
    }
    const me = await getUserById(user.id);
    const verified =
      me && me.active && me.role === "admin"
        ? await verifyCredentials(me.username, d.password)
        : null;
    if (!verified || verified.id !== user.id) {
      await recordLoginFailure(ident);
      return fail("That password is not right. Nothing was changed.");
    }
    await clearLoginFailures(ident);

    // --- the edit ---
    const resolved = await resolveLines(d);
    if ("error" in resolved) return fail(resolved.error);

    await updatePurchase({
      purchaseId: d.purchaseId,
      supplierId: d.supplierId,
      supplierInvoiceNo: d.supplierInvoiceNo,
      dateBs: d.dateBs,
      dateAd: bsToAdIso(d.dateBs),
      vatPaisa: resolved.vatPaisa,
      billDiscountPaisa: d.billDiscountPaisa,
      roundingPaisa: d.roundingPaisa,
      lines: resolved.lines,
      userId: user.id,
    });

    revalidatePath("/purchases");
    revalidatePath(`/purchases/${d.purchaseId}`);
    revalidatePath("/stock");
    revalidatePath("/items");
    revalidatePath("/reports/purchase-register");
    revalidatePath(`/suppliers/${d.supplierId}`);
    revalidatePath("/payables");
    return { ok: true, id: d.purchaseId };
  } catch (err) {
    return handle(err);
  }
}

export async function createPurchaseReturnAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    await requireModule("pharmacy");
    const user = await assertAdmin();
    const parsed = purchaseReturnSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const d = parsed.data;
    const id = await createPurchaseReturn({
      supplierId: d.supplierId,
      dateBs: d.dateBs,
      dateAd: bsToAdIso(d.dateBs),
      reason: d.reason,
      lines: d.lines,
      userId: user.id,
    });
    revalidatePath("/purchases");
    revalidatePath("/stock");
    revalidatePath(`/suppliers/${d.supplierId}`);
    revalidatePath("/payables");
    return { ok: true, id };
  } catch (err) {
    return handle(err);
  }
}
