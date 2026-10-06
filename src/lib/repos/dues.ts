/**
 * dues.ts — bills on dues, and the money that comes in against them later.
 *
 * A bill on dues is `payment_method = 'credit'` with `due_paisa` left owing at
 * the sale (0019). What it owes TODAY is never stored: it is the amount left
 * owing, less payments received since, less whatever returns took off it —
 * worked out by `balanceDue` in `lib/dues.ts`, the one place that decides it.
 *
 * Payments land in `due_payments`, one row per bill a payment touches, sharing
 * a receipt id so one payment across three bills is still one payment. The
 * receipt id comes from the screen, which is what makes pressing the button
 * twice record the money once.
 */
import "server-only";
import { ulid } from "ulid";
import type { Transaction } from "@libsql/client";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import {
  balanceDue,
  allocateOldestFirst,
  compareOldestFirst,
  groupByPerson,
  overpaymentError,
  personKey,
  totalOwed,
  isMoneyMethod,
  DuePaymentError,
  type MoneyMethod,
  type OwedBill,
  type DuePerson,
} from "@/lib/dues";
import {
  getOpenFiscalYear,
  assertYearOpen,
  ClosedFiscalYearError,
} from "@/lib/repos/fiscal";
import { recordAudit } from "@/lib/repos/audit";

/**
 * What a bill `b` left owing at the sale.
 *
 * A bill on dues always leaves something owing — `splitAtSale` turns one that
 * was paid in full into an ordinary bill — so a credit bill with `due_paisa`
 * of 0 was never written by this code. It was made by a counter running the
 * code from before 0019, between the migration and the deploy that follows
 * it, or it came back from a backup taken before then. Either way it is from
 * when credit meant nothing was paid, so the whole total is owed. Reading it
 * that way here, rather than trusting a backfill to have caught it, is what
 * stops such a bill from quietly reading as paid.
 */
export const OWED_AT_SALE_SQL = `(CASE
  WHEN b.payment_method = 'credit' AND b.due_paisa = 0 THEN b.total_paisa
  WHEN b.payment_method = 'credit' THEN b.due_paisa
  ELSE 0 END)`;

/**
 * The figures that decide a bill's debt, as SQL columns on a query over
 * `bills b`: what it left owing at the sale, and what has moved it since.
 * Voided payments never count.
 */
export const DUE_FACTS_SQL = `
  ${OWED_AT_SALE_SQL} AS owed_at_sale_paisa,
  IFNULL((SELECT SUM(dp.amount_paisa) FROM due_payments dp
           WHERE dp.bill_id = b.id AND dp.voided_at IS NULL), 0) AS received_paisa,
  IFNULL((SELECT SUM(sr.against_due_paisa) FROM sale_returns sr
           WHERE sr.bill_id = b.id), 0) AS returned_against_due_paisa`;

/** What a bill row selected with DUE_FACTS_SQL still owes. */
export function balanceOfRow(r: Row): number {
  return balanceDue({
    method: r.payment_method as string,
    status: r.status as string,
    settledInFull: r.credit_settled_at != null,
    duePaisa: Number(r.owed_at_sale_paisa ?? 0),
    receivedPaisa: Number(r.received_paisa ?? 0),
    returnedAgainstDuePaisa: Number(r.returned_against_due_paisa ?? 0),
  });
}

const OWED_SELECT = `
  SELECT b.id, b.invoice_no, b.date_ad, b.date_bs, b.total_paisa, b.due_paisa,
         b.payment_method, b.status, b.credit_settled_at, b.patient_id,
         b.patient_name, f.bs_label, p.patient_no,
         p.name AS registered_name, p.phone AS patient_phone,
         ${DUE_FACTS_SQL}
    FROM bills b
    LEFT JOIN fiscal_years f ON f.id = b.fiscal_year_id
    LEFT JOIN patients p ON p.id = b.patient_id
   WHERE b.payment_method = 'credit'
     AND b.status = 'saved'
     AND b.credit_settled_at IS NULL`;

function mapOwed(r: Row): OwedBill {
  const registered = (r.registered_name as string | null) ?? "";
  return {
    id: r.id as string,
    invoiceNo: r.invoice_no != null ? Number(r.invoice_no) : null,
    fiscalLabel: (r.bs_label as string | null) ?? "",
    dateAd: r.date_ad as string,
    dateBs: r.date_bs as string,
    totalPaisa: Number(r.total_paisa),
    duePaisa: Number(r.owed_at_sale_paisa),
    receivedPaisa: Number(r.received_paisa),
    returnedAgainstDuePaisa: Number(r.returned_against_due_paisa),
    balancePaisa: balanceOfRow(r),
    patientId: (r.patient_id as string | null) ?? null,
    patientNo: r.patient_no != null ? Number(r.patient_no) : null,
    name: registered || ((r.patient_name as string | null) ?? ""),
    phone: (r.patient_phone as string | null) ?? "",
  };
}

/** Every bill that still owes something, oldest first. */
export async function listOwedBills(
  filter: { patientId?: string } = {},
): Promise<OwedBill[]> {
  const res = await db().execute({
    sql: `${OWED_SELECT} ${filter.patientId ? "AND b.patient_id = ?" : ""}`,
    args: filter.patientId ? [filter.patientId] : [],
  });
  return res.rows
    .map(mapOwed)
    .filter((b) => b.balancePaisa > 0)
    .sort(compareOldestFirst);
}

/** Everybody who owes money, biggest debt first. */
export async function listDuePeople(todayAd: string): Promise<DuePerson[]> {
  return groupByPerson(await listOwedBills(), todayAd);
}

/** What one registered patient owes, across every bill. */
export async function owedByPatient(patientId: string): Promise<{
  owedPaisa: number;
  billCount: number;
}> {
  const bills = await listOwedBills({ patientId });
  return { owedPaisa: totalOwed(bills), billCount: bills.length };
}

/** The whole shop's dues, for the dashboard. */
export async function duesTotals(): Promise<{
  owedPaisa: number;
  people: number;
}> {
  const bills = await listOwedBills();
  const people = new Set(bills.map((b) => personKey(b))).size;
  return { owedPaisa: totalOwed(bills), people };
}

// ---- one bill ----

export interface DuePaymentRow {
  id: string;
  receiptId: string;
  amountPaisa: number;
  method: string;
  note: string;
  dateBs: string;
  dateAd: string;
  userName: string;
  voided: boolean;
  /** only a payment recorded in the open year can be undone */
  yearOpen: boolean;
}

export interface BillDues {
  /** sold on dues at the counter */
  onDues: boolean;
  totalPaisa: number;
  /** paid at the counter when the bill was made */
  paidAtSalePaisa: number;
  paidNowMethod: MoneyMethod | null;
  /** left owing at the sale */
  duePaisa: number;
  receivedPaisa: number;
  returnedAgainstDuePaisa: number;
  balancePaisa: number;
  /** cleared with the old "Mark paid" button, before payments were recorded */
  settledInFull: boolean;
  payments: DuePaymentRow[];
}

export async function getBillDues(billId: string): Promise<BillDues | null> {
  const head = await db().execute({
    sql: `SELECT b.id, b.total_paisa, b.due_paisa, b.paid_now_method,
                 b.payment_method, b.status, b.credit_settled_at,
                 ${DUE_FACTS_SQL}
            FROM bills b WHERE b.id = ?`,
    args: [billId],
  });
  const h = head.rows[0];
  if (!h) return null;
  const onDues = (h.payment_method as string) === "credit";
  const pays = await db().execute({
    sql: `SELECT dp.*, u.name AS user_name, f.status AS fy_status
            FROM due_payments dp
            LEFT JOIN users u ON u.id = dp.user_id
            LEFT JOIN fiscal_years f ON f.id = dp.fiscal_year_id
           WHERE dp.bill_id = ?
           ORDER BY dp.created_at, dp.rowid`,
    args: [billId],
  });
  const total = Number(h.total_paisa);
  const due = Number(h.owed_at_sale_paisa);
  const method = h.paid_now_method as string | null;
  return {
    onDues,
    totalPaisa: total,
    paidAtSalePaisa: onDues ? Math.max(0, total - due) : total,
    paidNowMethod: isMoneyMethod(method) ? method : null,
    duePaisa: due,
    receivedPaisa: Number(h.received_paisa),
    returnedAgainstDuePaisa: Number(h.returned_against_due_paisa),
    balancePaisa: balanceOfRow(h),
    settledInFull: h.credit_settled_at != null,
    payments: pays.rows.map((r) => ({
      id: r.id as string,
      receiptId: r.receipt_id as string,
      amountPaisa: Number(r.amount_paisa),
      method: r.method as string,
      note: (r.note as string) ?? "",
      dateBs: r.date_bs as string,
      dateAd: r.date_ad as string,
      userName: (r.user_name as string | null) ?? "",
      voided: r.voided_at != null,
      yearOpen: (r.fy_status as string | null) === "open",
    })),
  };
}

/**
 * What a bill owes, read inside a write transaction. Used by anything that
 * changes a debt, so two people at two screens cannot both take the same
 * rupee off it.
 */
export async function balanceInTx(tx: Transaction, billId: string): Promise<number> {
  const res = await tx.execute({
    sql: `SELECT b.payment_method, b.status, b.credit_settled_at,
                 ${DUE_FACTS_SQL}
            FROM bills b WHERE b.id = ?`,
    args: [billId],
  });
  const r = res.rows[0];
  return r ? balanceOfRow(r) : 0;
}

// ---- receiving money ----

export interface ReceiveDueInput {
  /** minted by the screen; the same id twice is the same payment */
  receiptId: string;
  /** the bills this payment is for — one person's; cleared oldest first */
  billIds: string[];
  amountPaisa: number;
  method: MoneyMethod;
  note: string;
  dateAd: string;
  dateBs: string;
  userId: string;
}

export interface ReceiveDueResult {
  receiptId: string;
  allocations: { billId: string; amountPaisa: number }[];
  /** what those bills still owe afterwards */
  stillOwedPaisa: number;
  alreadyExisted: boolean;
}

/**
 * Record money received against dues.
 *
 * The payment clears the oldest bill first. It may not be more than the bills
 * owe: a patient who hands over more is given change, and the software is
 * not the place to keep an advance.
 */
export async function receiveDuePayment(
  input: ReceiveDueInput,
): Promise<ReceiveDueResult> {
  const billIds = [...new Set(input.billIds)];
  if (billIds.length === 0) {
    throw new DuePaymentError("Choose which bill this payment is for.");
  }
  if (!Number.isInteger(input.amountPaisa) || input.amountPaisa <= 0) {
    throw new DuePaymentError("Enter how much was paid.");
  }
  if (!isMoneyMethod(input.method)) {
    throw new DuePaymentError("Choose how it was paid.");
  }

  // Idempotent on the receipt: a second press of the same button, or a retry
  // after a dropped connection, finds the first one and records nothing.
  const first = await existingReceipt(input.receiptId, billIds);
  if (first) return first;

  // Money that comes in today belongs to the year that is open today, whatever
  // year the bill was made in. With no open year there is nowhere to put it.
  const fy = await getOpenFiscalYear();
  if (!fy) throw new ClosedFiscalYearError();

  const now = new Date().toISOString();
  const tx = await db().transaction("write");
  let allocations: { billId: string; amountPaisa: number }[];
  let stillOwedPaisa: number;
  try {
    const placeholders = billIds.map(() => "?").join(", ");
    const res = await tx.execute({
      sql: `${OWED_SELECT} AND b.id IN (${placeholders})`,
      args: billIds,
    });
    const bills = res.rows
      .map(mapOwed)
      .filter((b) => b.balancePaisa > 0)
      .sort(compareOldestFirst);

    // One payment is one person's. Mixing two people's bills into one receipt
    // would split somebody's money onto a stranger's debt.
    const people = new Set(bills.map((b) => personKey(b)));
    if (people.size > 1) {
      throw new DuePaymentError(
        "Those bills are for different people. Take the payment for one person at a time.",
      );
    }

    const owed = totalOwed(bills);
    if (input.amountPaisa > owed) throw overpaymentError(owed);

    allocations = allocateOldestFirst(
      input.amountPaisa,
      bills.map((b) => ({ id: b.id, balancePaisa: b.balancePaisa })),
    );
    for (const a of allocations) {
      await tx.execute({
        sql: `INSERT INTO due_payments
                (id, receipt_id, bill_id, amount_paisa, method, note,
                 date_ad, date_bs, fiscal_year_id, user_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          ulid(),
          input.receiptId,
          a.billId,
          a.amountPaisa,
          input.method,
          input.note.trim(),
          input.dateAd,
          input.dateBs,
          fy.id,
          input.userId,
          now,
        ],
      });
    }
    stillOwedPaisa = owed - input.amountPaisa;
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    // Two presses racing each other: the unique index let exactly one of them
    // in. The loser reports the winner's payment rather than an error.
    const raced = await existingReceipt(input.receiptId, billIds);
    if (raced) return raced;
    throw err;
  }

  // Bill ids and amounts only: no names or phone numbers in the log (Rules §2.7).
  await recordAudit(input.userId, "dues.received", {
    receiptId: input.receiptId,
    amountPaisa: input.amountPaisa,
    method: input.method,
    bills: allocations,
  });

  return {
    receiptId: input.receiptId,
    allocations,
    stillOwedPaisa,
    alreadyExisted: false,
  };
}

async function existingReceipt(
  receiptId: string,
  billIds: string[],
): Promise<ReceiveDueResult | null> {
  const res = await db().execute({
    sql: "SELECT bill_id, amount_paisa FROM due_payments WHERE receipt_id = ?",
    args: [receiptId],
  });
  if (res.rows.length === 0) return null;
  return {
    receiptId,
    allocations: res.rows.map((r) => ({
      billId: r.bill_id as string,
      amountPaisa: Number(r.amount_paisa),
    })),
    stillOwedPaisa: await stillOwed(billIds),
    alreadyExisted: true,
  };
}

async function stillOwed(billIds: string[]): Promise<number> {
  if (billIds.length === 0) return 0;
  const res = await db().execute({
    sql: `${OWED_SELECT} AND b.id IN (${billIds.map(() => "?").join(", ")})`,
    args: billIds,
  });
  return totalOwed(res.rows.map(mapOwed));
}

/**
 * Undo a payment entered by mistake — the whole payment, across every bill it
 * cleared. The rows stay, marked void, so the audit trail and any day already
 * counted still show that something was entered and taken back.
 */
export async function voidDueReceipt(
  receiptId: string,
  userId: string,
): Promise<{ amountPaisa: number }> {
  const res = await db().execute({
    sql: `SELECT id, amount_paisa, fiscal_year_id, voided_at
            FROM due_payments WHERE receipt_id = ?`,
    args: [receiptId],
  });
  if (res.rows.length === 0) {
    throw new DuePaymentError("That payment is not there any more.");
  }
  const live = res.rows.filter((r) => r.voided_at == null);
  const amount = live.reduce((s, r) => s + Number(r.amount_paisa), 0);
  if (live.length === 0) return { amountPaisa: 0 };

  // Money recorded in a year that has since closed stays where it is (D-029).
  const fyId = res.rows[0]!.fiscal_year_id;
  if (fyId != null) await assertYearOpen(Number(fyId));

  await db().execute({
    sql: `UPDATE due_payments SET voided_at = ?, voided_by = ?
           WHERE receipt_id = ? AND voided_at IS NULL`,
    args: [new Date().toISOString(), userId, receiptId],
  });
  await recordAudit(userId, "dues.voided", { receiptId, amountPaisa: amount });
  return { amountPaisa: amount };
}

// ---- the history of what came in ----

export interface DueReceipt {
  receiptId: string;
  dateBs: string;
  dateAd: string;
  createdAt: string;
  amountPaisa: number;
  method: string;
  note: string;
  userName: string;
  voided: boolean;
  yearOpen: boolean;
  /** a bill it was paid against has since been cancelled */
  billCancelled: boolean;
  patientId: string | null;
  patientNo: number | null;
  name: string;
  bills: { id: string; invoiceNo: number | null; fiscalLabel: string; amountPaisa: number }[];
}

/** Payments received, newest first, each one whole however many bills it cleared. */
export async function listDueReceipts(limit = 300): Promise<DueReceipt[]> {
  const res = await db().execute({
    sql: `SELECT dp.receipt_id, dp.bill_id, dp.amount_paisa, dp.method, dp.note,
                 dp.date_ad, dp.date_bs, dp.created_at, dp.voided_at,
                 u.name AS user_name, pf.status AS pay_fy_status,
                 b.invoice_no, b.status AS bill_status, b.patient_id,
                 b.patient_name, bf.bs_label,
                 p.patient_no, p.name AS registered_name
            FROM due_payments dp
            JOIN bills b ON b.id = dp.bill_id
            LEFT JOIN fiscal_years bf ON bf.id = b.fiscal_year_id
            LEFT JOIN fiscal_years pf ON pf.id = dp.fiscal_year_id
            LEFT JOIN patients p ON p.id = b.patient_id
            LEFT JOIN users u ON u.id = dp.user_id
           WHERE dp.receipt_id IN (
                   SELECT receipt_id FROM due_payments
                    GROUP BY receipt_id
                    ORDER BY MAX(created_at) DESC
                    LIMIT ?)
           ORDER BY dp.created_at DESC, dp.receipt_id, dp.rowid`,
    args: [limit],
  });

  const byReceipt = new Map<string, DueReceipt>();
  for (const r of res.rows) {
    const id = r.receipt_id as string;
    let rc = byReceipt.get(id);
    if (!rc) {
      rc = {
        receiptId: id,
        dateBs: r.date_bs as string,
        dateAd: r.date_ad as string,
        createdAt: r.created_at as string,
        amountPaisa: 0,
        method: r.method as string,
        note: (r.note as string) ?? "",
        userName: (r.user_name as string | null) ?? "",
        voided: r.voided_at != null,
        yearOpen: (r.pay_fy_status as string | null) === "open",
        billCancelled: false,
        patientId: (r.patient_id as string | null) ?? null,
        patientNo: r.patient_no != null ? Number(r.patient_no) : null,
        name:
          (r.registered_name as string | null) ||
          ((r.patient_name as string | null) ?? ""),
        bills: [],
      };
      byReceipt.set(id, rc);
    }
    rc.amountPaisa += Number(r.amount_paisa);
    if (r.bill_status === "cancelled") rc.billCancelled = true;
    rc.bills.push({
      id: r.bill_id as string,
      invoiceNo: r.invoice_no != null ? Number(r.invoice_no) : null,
      fiscalLabel: (r.bs_label as string | null) ?? "",
      amountPaisa: Number(r.amount_paisa),
    });
  }
  return [...byReceipt.values()];
}
