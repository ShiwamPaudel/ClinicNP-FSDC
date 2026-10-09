/**
 * doctor-pay.ts — matching what a doctor was paid to the shares they earned
 * (C-037, 0025).
 *
 * Every service line a doctor did carries their share, frozen when the bill
 * was made. Payouts are amounts paid on a day, for no bill in particular. They
 * are tallied against the shares oldest first: the first payout clears the
 * oldest shares, the next carries on where it stopped. So each share reads
 * Paid, Part paid or Unpaid, and each payout knows which bills it covered.
 *
 * Nothing about the match is stored. It is worked out here each time from the
 * shares and the payouts that stand, so a refund that shrinks a share or a
 * payout that is undone simply moves the line — no stale tag can survive.
 *
 * Pure: shared by the statement, Payables and the exports.
 */

export interface ShareLine {
  id: string;
  /** what the doctor earned on this line, after any refund */
  earnedPaisa: number;
}

export interface PayoutLine {
  id: string;
  amountPaisa: number;
}

export type ShareStatus = "paid" | "part" | "unpaid";

export interface DoctorTally {
  /** per share line: how much of it has been paid, and so its status */
  lines: Map<string, { paidPaisa: number; status: ShareStatus }>;
  /** per payout: the share lines it went to, and what was left over as paid ahead */
  payouts: Map<string, { covers: { lineId: string; amountPaisa: number }[]; aheadPaisa: number }>;
  earnedPaisa: number;
  paidPaisa: number;
  /** earned less paid; below zero means the doctor was paid ahead */
  owedPaisa: number;
}

/**
 * Tally payouts against shares. Both lists must already be oldest first; a
 * share of nothing is skipped.
 */
export function tallyDoctorPay(shares: ShareLine[], payouts: PayoutLine[]): DoctorTally {
  const owing = shares.filter((s) => s.earnedPaisa > 0);
  const lines = new Map<string, { paidPaisa: number; status: ShareStatus }>();
  for (const s of owing) lines.set(s.id, { paidPaisa: 0, status: "unpaid" });

  const out = new Map<string, { covers: { lineId: string; amountPaisa: number }[]; aheadPaisa: number }>();
  let i = 0; // the share being paid into
  let leftOnShare = owing[0]?.earnedPaisa ?? 0;

  for (const p of payouts) {
    let left = Math.max(0, Math.trunc(p.amountPaisa));
    const covers: { lineId: string; amountPaisa: number }[] = [];
    while (left > 0 && i < owing.length) {
      const take = Math.min(left, leftOnShare);
      const share = owing[i]!;
      covers.push({ lineId: share.id, amountPaisa: take });
      const state = lines.get(share.id)!;
      state.paidPaisa += take;
      left -= take;
      leftOnShare -= take;
      if (leftOnShare === 0) {
        i += 1;
        leftOnShare = owing[i]?.earnedPaisa ?? 0;
      }
    }
    out.set(p.id, { covers, aheadPaisa: left });
  }

  for (const s of owing) {
    const state = lines.get(s.id)!;
    state.status =
      state.paidPaisa >= s.earnedPaisa ? "paid" : state.paidPaisa > 0 ? "part" : "unpaid";
  }

  const earnedPaisa = owing.reduce((t, s) => t + s.earnedPaisa, 0);
  const paidPaisa = payouts.reduce((t, p) => t + Math.max(0, Math.trunc(p.amountPaisa)), 0);
  return { lines, payouts: out, earnedPaisa, paidPaisa, owedPaisa: earnedPaisa - paidPaisa };
}

/**
 * A share scaled down by what was refunded, the way the Doctor payouts report
 * has always scaled it: share × what is left of the line ÷ what it was.
 */
export function earnedAfterRefunds(
  sharePaisa: number,
  amountPaisa: number,
  netAmountPaisa: number,
): number {
  if (amountPaisa <= 0) return Math.max(0, sharePaisa);
  const net = Math.max(0, Math.min(amountPaisa, netAmountPaisa));
  return Math.floor((sharePaisa * net) / amountPaisa);
}
