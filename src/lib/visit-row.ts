/**
 * visit-row.ts — a row added straight into a patient's history table (C-036).
 *
 * The clinic fills its paper card one line at a time: the date, what the
 * doctor did, what it cost, what was paid. A row typed into the table is the
 * same line. Its notes become a visit; its services, if any, become an
 * ordinary numbered bill made by `ingestBill`, so VAT, numbering, dues and
 * doctor shares work exactly as they do at the counter.
 *
 * Pure and shared: the form previews the charge with `rowCharge`, and the
 * server checks the payment against the same figure before it saves.
 */
import { vatSplit, type BillConfig } from "@/lib/bill-calc";
import { roundToRupee } from "@/lib/money";

export interface RowChargeLine {
  qty: number;
  ratePaisa: number;
  vatApplicable: boolean;
}

export interface RowCharge {
  subtotalPaisa: number;
  vatPaisa: number;
  taxablePaisa: number;
  totalPaisa: number;
}

/** What a row's services come to, worked out the way `ingestBill` works it out. */
export function rowCharge(lines: RowChargeLine[], config: BillConfig): RowCharge {
  let subtotal = 0;
  let vatable = 0;
  for (const l of lines) {
    const amount = Math.max(0, Math.trunc(l.qty) * Math.trunc(l.ratePaisa));
    subtotal += amount;
    if (l.vatApplicable) vatable += amount;
  }
  const split = vatSplit({
    subtotalPaisa: subtotal,
    vatableSubtotalPaisa: vatable,
    billDiscountPaisa: 0,
    vatRegistered: config.vatRegistered,
    vatInclusive: config.vatInclusive,
  });
  const total = config.roundingOn
    ? roundToRupee(split.totalBeforeRoundingPaisa)
    : split.totalBeforeRoundingPaisa;
  return {
    subtotalPaisa: subtotal,
    vatPaisa: split.vatPaisa,
    taxablePaisa: split.taxablePaisa,
    totalPaisa: total,
  };
}

export type RowPayMode = "full" | "part" | "credit";

/**
 * Why a row's payment cannot be saved as typed, or null when it can. A part
 * payment is something paid and something left; all of it is "Paid in full",
 * none of it is "On credit".
 */
export function rowPaymentProblem(
  mode: RowPayMode,
  paidPaisa: number,
  totalPaisa: number,
): string | null {
  if (mode !== "part") return null;
  if (!(paidPaisa > 0)) return "Enter how much was paid, or choose On credit.";
  if (paidPaisa >= totalPaisa) {
    return paidPaisa === totalPaisa
      ? "That is the whole charge. Choose Paid in full."
      : "That is more than the charge. Check the amount.";
  }
  return null;
}
