/**
 * bill-calc.ts — pure calculations for the active bill. Uses the REAL shared
 * fefo/units/money code (Rules §6: never mock FEFO/unit math in POS previews).
 */
import { allocate, type FefoBatch, type Allocation } from "@/lib/fefo";
import { vatOf, roundToRupee } from "@/lib/money";
import type { PosItem, PosUnit } from "@/lib/pos-types";

export interface BillLine {
  lineId: string;
  item: PosItem;
  unitLevel: number;
  qty: number;
  ratePaisa: number;
  rateOverridden: boolean;
  discountPaisa: number;
  overrideBatchId?: string;
}

export function unitByLevel(item: PosItem, level: number): PosUnit | undefined {
  return item.units.find((u) => u.level === level);
}

export function defaultUnit(item: PosItem): PosUnit {
  return item.units.find((u) => u.isDefaultSelling) ?? item.units[0]!;
}

/** Base-unit quantity a line consumes from stock. */
export function lineBaseQty(line: BillLine): number {
  const u = unitByLevel(line.item, line.unitLevel);
  return line.qty * (u?.factorToBase ?? 1);
}

/** Line money amount (qty × rate − discount), never negative. */
export function lineAmountPaisa(line: BillLine): number {
  return Math.max(0, line.qty * line.ratePaisa - line.discountPaisa);
}

export interface LinePreview {
  allocations: Allocation[];
  shortfallBaseQty: number;
  /** total sellable base stock for this item right now */
  availableBaseQty: number;
}

/** FEFO preview for a line, using the item's cached batches. */
export function linePreview(line: BillLine, todayIso: string): LinePreview {
  const fefoBatches: FefoBatch[] = line.item.batches.map((b) => ({
    id: b.id,
    expiryDateAd: b.expiryDateAd,
    remainingBaseQty: b.remainingBaseQty,
  }));
  const available = fefoBatches
    .filter((b) => b.expiryDateAd >= todayIso)
    .reduce((s, b) => s + b.remainingBaseQty, 0);
  const { allocations, shortfallBaseQty } = allocate(
    lineBaseQty(line),
    fefoBatches,
    todayIso,
    line.overrideBatchId ? { overrideBatchId: line.overrideBatchId } : {},
  );
  return { allocations, shortfallBaseQty, availableBaseQty: available };
}

/**
 * A service line on the active bill. No batch, no expiry, no unit hierarchy —
 * a service is a priced act, not a stock allocation (Architecture §3.4).
 */
export interface ServiceLine {
  lineId: string;
  serviceId: string;
  /** Name as shown and as printed; snapshotted onto the bill at save time. */
  name: string;
  groupId: string;
  qty: number;
  ratePaisa: number;
  rateOverridden: boolean;
  discountPaisa: number;
  /** Only meaningful when the company is VAT registered. */
  vatApplicable: boolean;
  doctorId: string | null;
  labPartnerId: string | null;
  followupApplied: boolean;
  followupNote: string;
}

/** Line money amount (qty × rate − discount), never negative. */
export function serviceLineAmountPaisa(line: ServiceLine): number {
  return Math.max(0, line.qty * line.ratePaisa - line.discountPaisa);
}

export interface BillTotals {
  subtotalPaisa: number;
  billDiscountPaisa: number;
  vatPaisa: number;
  totalPaisa: number;
}

export interface BillConfig {
  vatRegistered: boolean;
  roundingOn: boolean;
}

/**
 * Split `total` across `weights` so the parts sum to exactly `total`.
 *
 * Largest-remainder method: floor every share, then hand the leftover paisa
 * out one each to the lines that lost the most in the rounding. Used to record
 * per-line VAT that adds up to the VAT actually charged, rather than to a
 * number a paisa out.
 */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);

  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map((e) => Math.floor(e));
  let remainder = total - parts.reduce((s, p) => s + p, 0);

  const byLoss = exact
    .map((e, i) => ({ i, loss: e - Math.floor(e) }))
    .sort((a, b) => b.loss - a.loss || a.i - b.i);

  for (let k = 0; remainder > 0 && k < byLoss.length; k++, remainder--) {
    parts[byLoss[k]!.i] = parts[byLoss[k]!.i]! + 1;
  }
  return parts;
}

/**
 * One set of totals for a bill that may hold medicine lines, service lines, or
 * both.
 *
 * With no service lines this is arithmetically identical to the v1 behaviour,
 * and the v1 tests are left unchanged to prove it: when every line is VAT-able
 * the discount share below is the whole discount, so the VAT base collapses to
 * `subtotal − billDiscount` exactly as before.
 *
 * With service lines, VAT only applies to medicines plus the services flagged
 * VAT-able, and the bill-level discount is shared across everything in
 * proportion to line amount — so a discount on a mixed bill reduces the VAT
 * base by only its VAT-able share.
 */
export function billTotals(
  lines: BillLine[],
  billDiscountPaisa: number,
  config: BillConfig,
  // Deliberately NOT defaulted. It was `= []`, and the counter's payment pane
  // never passed it: a bill with a Rs 600 test on it showed a total of zero,
  // and Save stayed disabled because there were no medicine lines either. A
  // default that silently produces a wrong number is worse than a compile
  // error, so every caller now has to say what it means — pass [] for a
  // medicine-only bill, which is exactly what the default used to do.
  serviceLines: ServiceLine[],
): BillTotals {
  const medicineSubtotal = lines.reduce((s, l) => s + lineAmountPaisa(l), 0);
  const serviceSubtotal = serviceLines.reduce(
    (s, l) => s + serviceLineAmountPaisa(l),
    0,
  );
  const subtotal = medicineSubtotal + serviceSubtotal;
  const afterDiscount = Math.max(0, subtotal - billDiscountPaisa);

  let vat = 0;
  if (config.vatRegistered) {
    // Medicines are always VAT-able; a service only when its flag is on.
    const vatableSubtotal =
      medicineSubtotal +
      serviceLines.reduce(
        (s, l) => s + (l.vatApplicable ? serviceLineAmountPaisa(l) : 0),
        0,
      );
    const discountApplied = Math.min(billDiscountPaisa, subtotal);
    const vatableDiscount =
      subtotal > 0
        ? Math.floor((discountApplied * vatableSubtotal) / subtotal)
        : 0;
    vat = vatOf(Math.max(0, vatableSubtotal - vatableDiscount));
  }

  let total = afterDiscount + vat;
  if (config.roundingOn) total = roundToRupee(total);
  return {
    subtotalPaisa: subtotal,
    billDiscountPaisa,
    vatPaisa: vat,
    totalPaisa: total,
  };
}
