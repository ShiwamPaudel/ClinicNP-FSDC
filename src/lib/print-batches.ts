/**
 * print-batches.ts — the batch number and expiry printed against a medicine.
 *
 * Both are mandatory on a medicine bill (D-141): a patient, an inspector or the
 * shop itself has to be able to tell from the bill exactly which batch was
 * handed over and when it expires. So a medicine line either prints every
 * batch it was sold from with that batch's expiry, or it does not print at all
 * — there is no "—" for a medicine.
 */
import type { PrintBatchLine } from "@/lib/print-types";

/**
 * An expiry as the bill prints it: the English month and year, "12/2026" —
 * the way the pack prints it, so the two can be read against each other
 * (D-142). The day is left off on purpose; packs do not carry one.
 */
export function expiryForPrint(expiryDateAd: string): string {
  return `${expiryDateAd.slice(5, 7)}/${expiryDateAd.slice(0, 4)}`;
}

/**
 * What the bill prints for a medicine line, in the order its stock was taken:
 * one entry per batch, each with its own expiry. Null when the line has no
 * batch, or when any batch it draws on has no batch number or no expiry —
 * the counter refuses to save such a line rather than print it without them.
 */
export function batchesForPrint(
  allocations: readonly { batchId: string }[],
  batches: readonly { id: string; batchNo: string; expiryDateAd: string }[],
): PrintBatchLine[] | null {
  if (allocations.length === 0) return null;
  const out: PrintBatchLine[] = [];
  for (const a of allocations) {
    const b = batches.find((x) => x.id === a.batchId);
    const batchNo = b?.batchNo.trim() ?? "";
    if (!b || batchNo === "" || !/^\d{4}-\d{2}-\d{2}$/.test(b.expiryDateAd)) {
      return null;
    }
    out.push({ batchNo, expiry: expiryForPrint(b.expiryDateAd) });
  }
  return out;
}
