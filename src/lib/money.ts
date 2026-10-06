/**
 * money.ts — all money is integer paisa. Never float arithmetic on money.
 * 100 paisa = 1 rupee. Formatting to `रू 1,234.50` happens ONLY here.
 * See Rules.md §1.2.
 */

/** VAT rate for Nepal — the single source of truth. */
export const VAT_RATE = 0.13;

/** Round a floating result to the nearest integer paisa (used only at conversion boundaries). */
export function toPaisa(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paisaToRupees(paisa: number): number {
  return paisa / 100;
}

/**
 * VAT amount in paisa for a given base amount in paisa.
 * Integer math: (amount * 13) / 100, rounded to nearest paisa.
 */
export function vatOf(basePaisa: number): number {
  return Math.round((basePaisa * 13) / 100);
}

/**
 * Line amount = qty * rate, minus discount, all in paisa.
 * qty is an integer count of the selling unit; rate is paisa per that unit.
 */
export function lineAmount(
  qty: number,
  ratePaisa: number,
  discountPaisa = 0,
): number {
  const gross = qty * ratePaisa;
  return Math.max(0, gross - discountPaisa);
}

/** Apply a percentage discount to a paisa amount, returning the discount in paisa. */
export function percentDiscount(amountPaisa: number, percent: number): number {
  return Math.round((amountPaisa * percent) / 100);
}

/** Round a grand total to the nearest whole rupee (paisa in → paisa out). */
export function roundToRupee(paisa: number): number {
  return Math.round(paisa / 100) * 100;
}

/** Change to return to the customer, never negative. */
export function change(tenderedPaisa: number, totalPaisa: number): number {
  return Math.max(0, tenderedPaisa - totalPaisa);
}

const nf = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format paisa as `रू 1,234.50`. Devanagari `रू` prefix per PRD.
 * @param withSymbol include the `रू` symbol (default true)
 */
export function formatPaisa(paisa: number, withSymbol = true): string {
  const negative = paisa < 0;
  const rupees = Math.abs(paisa) / 100;
  const body = nf.format(rupees);
  const signed = negative ? `-${body}` : body;
  return withSymbol ? `रू ${signed}` : signed;
}
