/**
 * supplies.ts — what a purchase is for (C-035).
 *
 * With the pharmacy on, a purchase is stock for sale: every line is a batch
 * with its number and expiry, its selling price, and a count that the counter
 * sells down. With the pharmacy off, nothing bought is ever sold — the clinic
 * uses it (gloves, composite, burs). A purchase is then only what was bought,
 * from whom, for how much, and what is still owed: no batch, no expiry, no
 * selling price, and no stock to count.
 *
 * Shared by the server and the browser, so it imports nothing server-only.
 */
import type { ModuleFlags } from "@/lib/repos/company";

/** True when what is bought is used by the clinic, never sold. */
export function buysForUse(modules: Pick<ModuleFlags, "pharmacy">): boolean {
  return !modules.pharmacy;
}

/**
 * The expiry stored on a batch bought for use. `batches.expiry_date_ad` is
 * NOT NULL (0001), so it needs a date; this one sorts after every real expiry
 * and never reaches an expiry warning. It is never shown — see `hasExpiry`.
 */
export const NO_EXPIRY_AD = "9999-12-31";

/**
 * What a purchase line still needs before it can be saved, or null when it is
 * complete. Stock for sale needs its batch and expiry — they drive
 * sell-oldest-first and the expiry warnings. Bought for use, it needs neither.
 * `n` is the line's number on the form, counted from 1.
 */
export function missingOnLine(
  line: { batchNo: string; expiryDateBs: string },
  n: number,
  forUse: boolean,
): string | null {
  if (forUse) return null;
  if (!line.batchNo.trim()) return `Line ${n}: enter the batch number.`;
  if (!line.expiryDateBs) return `Line ${n}: enter the expiry date.`;
  return null;
}

/** Whether a stored expiry is a real date someone typed, worth showing. */
export function hasExpiry(expiryDateAd: string | null | undefined): boolean {
  return !!expiryDateAd && expiryDateAd !== NO_EXPIRY_AD;
}
