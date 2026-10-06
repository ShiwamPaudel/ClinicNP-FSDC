/**
 * discount.ts — the bill discount, typed either as rupees or as a percentage.
 *
 * A percentage is always of the bill as it stands, so it is worked out again
 * whenever a line changes rather than frozen at the moment it was typed: 10%
 * of a bill that then grows by a strip is still 10%. What reaches the server
 * is the rupee figure this returns, the same as a discount typed in rupees.
 *
 * Pure and client-safe. Money is integer paisa (Rules §1.2); the percentage
 * itself may carry decimals (2.5%).
 */
import { percentDiscount } from "@/lib/money";
import {
  billTotals,
  type BillConfig,
  type BillLine,
  type BillTotals,
  type ServiceLine,
} from "@/lib/bill-calc";

export type DiscountMode = "amount" | "percent";

/** A percentage the counter will accept: 0 to 100, at most two decimals. */
export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.min(100, Math.round(percent * 100) / 100);
}

/**
 * The bill discount in paisa.
 *
 * In rupees it is exactly what was typed, as it always has been. As a
 * percentage it is that share of the subtotal, rounded to the paisa, and so can
 * never be more than the bill.
 */
export function resolveBillDiscount(
  subtotalPaisa: number,
  mode: DiscountMode,
  amountPaisa: number,
  percent: number,
): number {
  if (mode === "percent") {
    return percentDiscount(Math.max(0, subtotalPaisa), clampPercent(percent));
  }
  return Math.max(0, Math.trunc(amountPaisa));
}

/**
 * The bill's totals with its discount worked out, for the counter. The payment
 * panel shows these and the save sends them, so the two cannot disagree.
 */
export function counterTotals(
  lines: BillLine[],
  serviceLines: ServiceLine[],
  discount: { mode: DiscountMode; amountPaisa: number; percent: number },
  cfg: BillConfig,
): BillTotals {
  const subtotal = billTotals(lines, 0, cfg, serviceLines).subtotalPaisa;
  const off = resolveBillDiscount(
    subtotal,
    discount.mode,
    discount.amountPaisa,
    discount.percent,
  );
  return billTotals(lines, off, cfg, serviceLines);
}
