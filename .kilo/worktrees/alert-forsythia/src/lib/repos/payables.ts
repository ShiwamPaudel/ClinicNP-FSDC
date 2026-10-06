/**
 * payables.ts — what the clinic owes, and to whom: suppliers for medicine and
 * laboratories for tests sent out. The other side of Dues.
 *
 * Nothing here keeps a balance of its own. A supplier's figure is the supplier
 * ledger's (purchases, less returns, less payments) and a laboratory's is the
 * laboratory statement's "owed now", so this screen, the supplier page and the
 * laboratory report can never disagree.
 *
 * A payment typed wrong is undone, not deleted (0023): it stays on file with
 * who undid it, when and why, and stops counting. Money paid in a year that has
 * since closed stays where it is (D-029), the same rule as a dues payment.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import { partnerSummary } from "@/lib/repos/clinic-reports";
import { bsFromDbText, fiscalYearOf } from "@/lib/bs";

export type PayableKind = "supplier" | "lab";

export interface PayableParty {
  kind: PayableKind;
  id: string;
  name: string;
  active: boolean;
  /** what the clinic owes now; below zero means paid ahead */
  owedPaisa: number;
}

/** A payment refused for a reason the person can act on. */
export class PaymentError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
    this.name = "PaymentError";
  }
}

/** Every supplier with what is owed to them, largest first. */
export async function supplierPayables(): Promise<PayableParty[]> {
  const res = await db().execute(
    `SELECT s.id, s.name, s.active,
            COALESCE((SELECT SUM(total_paisa) FROM purchases p
                       WHERE p.supplier_id = s.id), 0)
          - COALESCE((SELECT SUM(total_paisa) FROM purchase_returns r
                       WHERE r.supplier_id = s.id), 0)
          - COALESCE((SELECT SUM(amount_paisa) FROM supplier_payments sp
                       WHERE sp.supplier_id = s.id AND sp.voided_at IS NULL), 0) AS owed
       FROM suppliers s`,
  );
  return sortParties(
    res.rows.map((r: Row) => ({
      kind: "supplier" as const,
      id: r.id as string,
      name: r.name as string,
      active: Number(r.active) === 1,
      owedPaisa: Number(r.owed),
    })),
  );
}

/** Every laboratory with what is owed to it — the statement's "owed now". */
export async function labPayables(): Promise<PayableParty[]> {
  // "Owed now" is all-time whatever range is asked for; the range only moves
  // the period columns, which are not read here.
  const today = new Date().toISOString().slice(0, 10);
  const rows = await partnerSummary({ fromIso: today, toIso: today });
  const active = await db().execute("SELECT id, active FROM lab_partners");
  const isActive = new Map(
    active.rows.map((r) => [r.id as string, Number(r.active) === 1]),
  );
  return sortParties(
    rows.map((r) => ({
      kind: "lab" as const,
      id: r.partnerId,
      name: r.name,
      active: isActive.get(r.partnerId) ?? true,
      owedPaisa: r.balancePaisa,
    })),
  );
}

/**
 * Owed first, largest at the top; then those paid ahead; then the settled
 * ones by name. A switched-off party with nothing owed is left off — there is
 * nothing to pay and nobody to pay it to.
 */
function sortParties(rows: PayableParty[]): PayableParty[] {
  return rows
    .filter((r) => r.active || r.owedPaisa !== 0)
    .sort((a, b) => {
      const rank = (p: PayableParty) => (p.owedPaisa > 0 ? 0 : p.owedPaisa < 0 ? 1 : 2);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (a.owedPaisa !== b.owedPaisa) return b.owedPaisa - a.owedPaisa;
      return a.name.localeCompare(b.name);
    });
}

export interface PaymentMade {
  kind: PayableKind;
  id: string;
  partyId: string;
  partyName: string;
  dateBs: string;
  dateAd: string;
  amountPaisa: number;
  method: string;
  note: string;
  /** set when it was paid as a purchase was entered */
  purchaseId: string | null;
  purchaseNo: string | null;
  userName: string;
  createdAt: string;
  voided: boolean;
  voidedByName: string;
  voidReason: string;
  /** false once the payment's fiscal year has closed; it can no longer be undone */
  yearOpen: boolean;
}

/** The most recent payments to suppliers and/or laboratories, newest first. */
export async function recentPayments(
  include: { suppliers: boolean; labs: boolean },
  limit = 60,
): Promise<PaymentMade[]> {
  const parts: string[] = [];
  if (include.suppliers) {
    parts.push(`
      SELECT 'supplier' AS kind, sp.id, sp.supplier_id AS party_id, s.name AS party_name,
             sp.date_bs, sp.date_ad, sp.amount_paisa, sp.method, sp.note,
             sp.purchase_id, p.purchase_no, sp.created_at, u.name AS user_name,
             sp.voided_at, vu.name AS voided_by_name, sp.void_reason
        FROM supplier_payments sp
        JOIN suppliers s ON s.id = sp.supplier_id
        LEFT JOIN purchases p ON p.id = sp.purchase_id
        LEFT JOIN users u ON u.id = sp.user_id
        LEFT JOIN users vu ON vu.id = sp.voided_by`);
  }
  if (include.labs) {
    parts.push(`
      SELECT 'lab' AS kind, lp.id, lp.lab_partner_id AS party_id, l.name AS party_name,
             lp.date_bs, lp.date_ad, lp.amount_paisa, lp.method, lp.note,
             NULL AS purchase_id, NULL AS purchase_no, lp.created_at, u.name AS user_name,
             lp.voided_at, vu.name AS voided_by_name, lp.void_reason
        FROM lab_partner_payments lp
        JOIN lab_partners l ON l.id = lp.lab_partner_id
        LEFT JOIN users u ON u.id = lp.user_id
        LEFT JOIN users vu ON vu.id = lp.voided_by`);
  }
  if (parts.length === 0) return [];

  const [res, years] = await Promise.all([
    db().execute({
      // Sorted from outside: SQLite will not order a compound SELECT by a
      // column that is only named inside one of its halves.
      sql: `SELECT * FROM (${parts.join(" UNION ALL ")})
             ORDER BY created_at DESC, id DESC LIMIT ?`,
      args: [limit],
    }),
    db().execute("SELECT bs_label, status FROM fiscal_years"),
  ]);
  const status = new Map(years.rows.map((r) => [r.bs_label as string, r.status as string]));

  return res.rows.map((r: Row) => {
    const dateBs = r.date_bs as string;
    const label = fiscalYearOf(bsFromDbText(dateBs)).label;
    return {
      kind: r.kind as PayableKind,
      id: r.id as string,
      partyId: r.party_id as string,
      partyName: r.party_name as string,
      dateBs,
      dateAd: r.date_ad as string,
      amountPaisa: Number(r.amount_paisa),
      method: r.method as string,
      note: (r.note as string) ?? "",
      purchaseId: (r.purchase_id as string | null) ?? null,
      purchaseNo: (r.purchase_no as string | null) ?? null,
      userName: (r.user_name as string | null) ?? "",
      createdAt: r.created_at as string,
      voided: r.voided_at != null,
      voidedByName: (r.voided_by_name as string | null) ?? "",
      voidReason: (r.void_reason as string) ?? "",
      // A year with no row yet is the year being worked in, not a closed one.
      yearOpen: (status.get(label) ?? "open") === "open",
    };
  });
}

/**
 * Undo a payment entered by mistake. It stays on file, marked, and stops
 * counting towards the balance. Refused once its year has closed.
 */
export async function voidPayment(input: {
  kind: PayableKind;
  paymentId: string;
  reason: string;
  userId: string;
}): Promise<{ partyId: string; amountPaisa: number; purchaseId: string | null }> {
  const reason = input.reason.trim();
  if (!reason) throw new PaymentError("Say why this payment is being undone.");

  const table = input.kind === "supplier" ? "supplier_payments" : "lab_partner_payments";
  const partyCol = input.kind === "supplier" ? "supplier_id" : "lab_partner_id";
  const purchaseCol = input.kind === "supplier" ? "purchase_id" : "NULL";

  const tx = await db().transaction("write");
  try {
    const res = await tx.execute({
      sql: `SELECT ${partyCol} AS party_id, ${purchaseCol} AS purchase_id,
                   amount_paisa, method, date_bs, voided_at
              FROM ${table} WHERE id = ?`,
      args: [input.paymentId],
    });
    const row = res.rows[0] as Row | undefined;
    if (!row) throw new PaymentError("That payment is not there any more.");
    if (row.voided_at != null) throw new PaymentError("That payment has already been undone.");

    // Read inside the transaction, so the check and the write see one state.
    const label = fiscalYearOf(bsFromDbText(row.date_bs as string)).label;
    const fy = await tx.execute({
      sql: "SELECT status FROM fiscal_years WHERE bs_label = ?",
      args: [label],
    });
    const status = fy.rows[0]?.status as string | undefined;
    if (status !== undefined && status !== "open") {
      throw new PaymentError(
        `Fiscal year ${label} is closed, so its payments can no longer be undone.`,
      );
    }

    const now = new Date().toISOString();
    const upd = await tx.execute({
      sql: `UPDATE ${table} SET voided_at = ?, voided_by = ?, void_reason = ?
             WHERE id = ? AND voided_at IS NULL`,
      args: [now, input.userId, reason, input.paymentId],
    });
    if (Number(upd.rowsAffected) !== 1) {
      throw new PaymentError("That payment has already been undone.");
    }

    const amountPaisa = Number(row.amount_paisa);
    const partyId = row.party_id as string;
    const purchaseId = (row.purchase_id as string | null) ?? null;
    await tx.execute({
      sql: `INSERT INTO audit_log (id, user_id, action, detail_json, at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        ulid(),
        input.userId,
        input.kind === "supplier" ? "supplier.payment_voided" : "lab_partner.payment_voided",
        JSON.stringify({
          entity: input.kind === "supplier" ? "supplier" : "lab_partner",
          entityId: partyId,
          paymentId: input.paymentId,
          amountPaisa,
          method: row.method,
          dateBs: row.date_bs,
          ...(purchaseId ? { purchaseId } : {}),
          reason,
        }),
        now,
      ],
    });

    await tx.commit();
    return { partyId, amountPaisa, purchaseId };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
