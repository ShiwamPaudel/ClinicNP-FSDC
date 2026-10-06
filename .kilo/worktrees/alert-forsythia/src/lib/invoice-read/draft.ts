/**
 * draft.ts — the bridge between what was read off a photo and what the
 * purchase form holds.
 *
 * Everything is text here, in the same shape the form's own boxes use, because
 * a draft is not a purchase: it is a set of boxes filled in for somebody to
 * check against the paper in their hand. Nothing is saved, nothing is
 * validated away, and a figure that could not be read is left empty rather
 * than guessed — an empty box asks to be filled, a wrong one does not.
 */
import { toBS, bsToDbText } from "@/lib/bs";
import { paisaToRupees } from "@/lib/money";
import { matchItem, type MatchCandidate } from "./match";
import type { ReadInvoice } from "./parse";

export interface DraftLine {
  /** "" when nothing in the catalogue was close enough. */
  itemId: string;
  unitLevel: number;
  /** The name as the supplier printed it, kept beside the box either way. */
  printedName: string;
  batchNo: string;
  expiryDateBs: string;
  qty: string;
  freeQty: string;
  costRupees: string;
  /** True when qty x rate did not agree with the amount printed on the bill. */
  amountDisagrees: boolean;
}

export interface Draft {
  invoiceNo: string;
  dateBs: string;
  applyVat: boolean;
  billDiscountRupees: string;
  roundingRupees: string;
  lines: DraftLine[];
  /** The bill's own net total, for telling the person whether the two agree. */
  netTotalPaisa: number | null;
  /** How many lines were read, and how many of them found a medicine. */
  matched: number;
}

export interface DraftItem extends MatchCandidate {
  units: { level: number }[];
}

/**
 * A pack expires at the end of the month it is stamped with, so "2028/02"
 * becomes 29 February 2028 — which is also what makes it print back as
 * "02/2028" on a sales bill (D-142).
 */
export function expiryMonthToBs(adMonth: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(adMonth);
  if (!m) return "";
  const year = Number(m[1]);
  const month = Number(m[2]);
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(year, month, 0);
  try {
    return bsToDbText(toBS(lastDay));
  } catch {
    // Outside the converter's range — better empty than wrong.
    return "";
  }
}

function rupeeText(paisa: number): string {
  return paisaToRupees(paisa).toFixed(2);
}

export function buildDraft(read: ReadInvoice, items: DraftItem[]): Draft {
  let matched = 0;
  const lines: DraftLine[] = read.lines.map((line) => {
    const hit = line.printedName ? matchItem(line.printedName, items) : null;
    const item = hit?.confident ? items.find((i) => i.id === hit.itemId) : undefined;
    if (item) matched++;
    return {
      itemId: item?.id ?? "",
      // The purchase unit is the biggest one, as it is when the box is used by
      // hand: a supplier prices by the strip or the box, not by the tablet.
      unitLevel: item ? Math.max(...item.units.map((u) => u.level)) : 0,
      printedName: line.printedName,
      batchNo: line.batchNo,
      expiryDateBs: expiryMonthToBs(line.expiryAdMonth),
      qty: String(line.qty),
      freeQty: String(line.freeQty),
      costRupees: rupeeText(line.unitCostPaisa),
      amountDisagrees: line.amountDisagrees,
    };
  });

  return {
    invoiceNo: read.invoiceNo,
    dateBs: read.dateBs,
    applyVat: read.hasVat,
    billDiscountRupees: read.billDiscountPaisa ? rupeeText(read.billDiscountPaisa) : "",
    roundingRupees: read.roundingPaisa ? rupeeText(read.roundingPaisa) : "",
    lines,
    netTotalPaisa: read.netTotalPaisa,
    matched,
  };
}
