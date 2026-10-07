/**
 * patient-ledger.ts — a patient's history as the clinic's paper card has it:
 * one line per thing that happened, oldest first, with what was charged, what
 * was paid, and what is still owed after it.
 *
 *   Date | Treatment notes | Service charge | Payment | Due
 *
 * Pure: the repo gathers the rows, this decides the order and the running
 * balance. The balance on the last line is what the patient owes, and it must
 * agree with Dues — so it moves by exactly what `balanceDue` counts:
 *
 *   a bill          + its total, − what was paid at the counter
 *   a payment later − the payment
 *   a refund        − what it took off dues (a refund paid back in cash
 *                     changes the charge and the payment alike, not the debt)
 *   "marked paid"   − whatever was left on that bill (bills cleared before
 *                     payments were recorded one by one)
 *
 * A cancelled bill is not on the card: it was never owed. A visit with no bill
 * is, with its notes and no money.
 */

export interface LedgerVisitInput {
  id: string;
  dateBs: string;
  /** UTC timestamp, for ordering within a day */
  at: string;
  complaint: string;
  findings: string;
  advice: string;
  doctorName: string;
  cancelled: boolean;
}

export interface LedgerBillInput {
  id: string;
  label: string;
  dateBs: string;
  at: string;
  visitId: string | null;
  /** "Crown filling", "Paracetamol 500mg × 10 Tablet" */
  items: string[];
  totalPaisa: number;
  /** what was left owing when it was made; 0 for a bill paid in full */
  owedAtSalePaisa: number;
  cancelled: boolean;
  /** cleared with the old "Mark paid" button */
  settledAt: string | null;
  /** the BS date of settledAt */
  settledDateBs: string | null;
}

export interface LedgerPaymentInput {
  billId: string;
  dateBs: string;
  at: string;
  amountPaisa: number;
  method: string;
}

export interface LedgerRefundInput {
  billId: string;
  dateBs: string;
  at: string;
  totalPaisa: number;
  /** the part of the refund that came off what was owed, not paid back */
  againstDuePaisa: number;
}

export type LedgerKind = "bill" | "visit" | "payment" | "refund";

export interface LedgerRow {
  key: string;
  kind: LedgerKind;
  dateBs: string;
  at: string;
  /** the main line: what was done */
  title: string;
  /** further lines: complaint, findings, advice, doctor */
  notes: string[];
  /** null where the row carries no money of that kind */
  feePaisa: number | null;
  paymentPaisa: number | null;
  /** owed after this row; negative would be an advance */
  balancePaisa: number;
  billId: string | null;
  visitId: string | null;
}

/** "Paid in cash", "Paid by QR" — kept short for the table. */
function methodLabel(method: string): string {
  if (method === "qr") return "QR";
  if (method === "cash") return "Cash";
  return method;
}

function visitNotes(v: LedgerVisitInput | undefined): string[] {
  if (!v) return [];
  const out: string[] = [];
  if (v.complaint.trim()) out.push(`Complaint: ${v.complaint.trim()}`);
  if (v.findings.trim()) out.push(`Findings: ${v.findings.trim()}`);
  if (v.advice.trim()) out.push(`Advice: ${v.advice.trim()}`);
  if (v.doctorName.trim()) out.push(`Seen by ${v.doctorName.trim()}`);
  return out;
}

/** Oldest first; within a day by the moment it happened. */
function compareRows(a: { dateBs: string; at: string; order: number }, b: typeof a): number {
  return (
    a.dateBs.localeCompare(b.dateBs) ||
    a.at.localeCompare(b.at) ||
    a.order - b.order
  );
}

export function buildLedger(input: {
  visits: LedgerVisitInput[];
  bills: LedgerBillInput[];
  payments: LedgerPaymentInput[];
  refunds: LedgerRefundInput[];
}): LedgerRow[] {
  const bills = input.bills.filter((b) => !b.cancelled);
  const billById = new Map(bills.map((b) => [b.id, b]));
  const visitById = new Map(input.visits.map((v) => [v.id, v]));
  const visitsWithBill = new Set(bills.map((b) => b.visitId).filter(Boolean));

  // A visit's notes go on the first of its bills, so one appointment is one
  // line rather than a notes line followed by a money line.
  const notesShown = new Set<string>();

  type Pending = Omit<LedgerRow, "balancePaisa"> & { delta: number; order: number };
  const rows: Pending[] = [];

  for (const v of input.visits) {
    if (v.cancelled || visitsWithBill.has(v.id)) continue;
    rows.push({
      key: `v:${v.id}`,
      kind: "visit",
      dateBs: v.dateBs,
      at: v.at,
      title: "Visit",
      notes: visitNotes(v),
      feePaisa: null,
      paymentPaisa: null,
      billId: null,
      visitId: v.id,
      delta: 0,
      order: 0,
    });
  }

  for (const b of bills) {
    const paidAtSale = Math.max(0, b.totalPaisa - b.owedAtSalePaisa);
    let notes: string[] = [];
    if (b.visitId && !notesShown.has(b.visitId)) {
      notes = visitNotes(visitById.get(b.visitId));
      notesShown.add(b.visitId);
    }
    rows.push({
      key: `b:${b.id}`,
      kind: "bill",
      dateBs: b.dateBs,
      at: b.at,
      title: b.items.length > 0 ? b.items.join(", ") : `Bill ${b.label}`,
      notes,
      feePaisa: b.totalPaisa,
      paymentPaisa: paidAtSale,
      billId: b.id,
      visitId: b.visitId,
      delta: b.totalPaisa - paidAtSale,
      order: 1,
    });
  }

  for (const p of input.payments) {
    const bill = billById.get(p.billId);
    if (!bill) continue; // against a cancelled bill: never owed, never on the card
    rows.push({
      key: `p:${p.billId}:${p.at}:${p.amountPaisa}`,
      kind: "payment",
      dateBs: p.dateBs,
      at: p.at,
      title: `Payment received · ${methodLabel(p.method)}`,
      notes: [`Against bill ${bill.label}`],
      feePaisa: null,
      paymentPaisa: p.amountPaisa,
      billId: bill.id,
      visitId: null,
      delta: -p.amountPaisa,
      order: 2,
    });
  }

  for (const r of input.refunds) {
    const bill = billById.get(r.billId);
    if (!bill) continue;
    const paidBack = Math.max(0, r.totalPaisa - r.againstDuePaisa);
    rows.push({
      key: `r:${r.billId}:${r.at}`,
      kind: "refund",
      dateBs: r.dateBs,
      at: r.at,
      title: `Refund on bill ${bill.label}`,
      notes:
        r.againstDuePaisa > 0 && paidBack > 0
          ? ["Part taken off what was owed, part paid back"]
          : r.againstDuePaisa > 0
            ? ["Taken off what was owed"]
            : ["Paid back"],
      feePaisa: -r.totalPaisa,
      paymentPaisa: paidBack > 0 ? -paidBack : null,
      billId: bill.id,
      visitId: null,
      delta: -r.againstDuePaisa,
      order: 3,
    });
  }

  rows.sort(compareRows);

  // Bills cleared with the old "Mark paid" button: whatever was still owed on
  // them at that moment is shown as paid then.
  const owedOnBill = new Map<string, number>();
  const out: LedgerRow[] = [];
  let balance = 0;
  const settled = bills
    .filter((b) => b.settledAt)
    .sort((a, b) => (a.settledAt ?? "").localeCompare(b.settledAt ?? ""));
  let si = 0;

  const flushSettled = (beforeAt: string | null) => {
    while (
      si < settled.length &&
      (beforeAt === null || (settled[si]!.settledAt ?? "") <= beforeAt)
    ) {
      const b = settled[si++]!;
      const left = owedOnBill.get(b.id) ?? 0;
      if (left > 0) {
        balance -= left;
        owedOnBill.set(b.id, 0);
        out.push({
          key: `s:${b.id}`,
          kind: "payment",
          dateBs: b.settledDateBs ?? b.dateBs,
          at: b.settledAt ?? "",
          title: "Marked as paid",
          notes: [`Bill ${b.label}`],
          feePaisa: null,
          paymentPaisa: left,
          balancePaisa: balance,
          billId: b.id,
          visitId: null,
        });
      }
    }
  };

  for (const r of rows) {
    flushSettled(r.at);
    balance += r.delta;
    if (r.billId) owedOnBill.set(r.billId, (owedOnBill.get(r.billId) ?? 0) + r.delta);
    const { delta: _delta, order: _order, ...row } = r;
    void _delta;
    void _order;
    out.push({ ...row, balancePaisa: balance });
  }
  flushSettled(null);

  return out;
}
