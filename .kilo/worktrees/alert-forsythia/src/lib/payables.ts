/**
 * payables.ts — words for paying suppliers and laboratories, safe on both the
 * server and the browser.
 */

/** Every way a payment to a supplier or a laboratory has been recorded. */
export const PAYABLE_METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank: "Bank transfer",
  cheque: "Cheque",
  qr: "QR / digital wallet",
  adjustment: "Adjustment",
};

/** A stored method in words; anything older or unexpected reads as itself. */
export function payableMethodLabel(method: string): string {
  return PAYABLE_METHOD_LABEL[method] ?? method;
}
