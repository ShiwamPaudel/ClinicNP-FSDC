/**
 * doctor-pay.ts — what each doctor has earned, what they have been paid, and
 * which bills each payout covered (C-037, 0025).
 *
 * The share on a bill line is the one frozen when the bill was made, scaled
 * down by any refund — exactly what the Doctor payouts report adds up, so the
 * report, this statement and Payables cannot disagree. A payout is tallied
 * against the oldest unpaid shares by `tallyDoctorPay`; nothing about that
 * match is stored.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import { formatDocNo } from "@/lib/invoice-number";
import { earnedAfterRefunds, tallyDoctorPay, type ShareStatus } from "@/lib/doctor-pay";

/** A service line's value after refunds — the same sum the reports use. */
const NET_AMOUNT = `
  (sl.amount_paisa - COALESCE((
     SELECT SUM(r.amount_paisa) FROM sale_return_service_lines r
      WHERE r.bill_service_line_id = sl.id), 0))`;

export interface DoctorShareRow {
  lineId: string;
  billId: string;
  billLabel: string;
  dateBs: string;
  dateAd: string;
  patientName: string;
  service: string;
  qty: number;
  billedPaisa: number;
  earnedPaisa: number;
  paidPaisa: number;
  status: ShareStatus;
}

export interface DoctorPayoutRow {
  id: string;
  dateBs: string;
  dateAd: string;
  amountPaisa: number;
  method: string;
  note: string;
  userName: string;
  createdAt: string;
  voided: boolean;
  voidReason: string;
  /** the bills this payout went to, oldest first */
  covers: { billLabel: string; amountPaisa: number }[];
  /** what was left over after every share was paid */
  aheadPaisa: number;
}

export interface DoctorPayStatement {
  doctorId: string;
  name: string;
  basis: string;
  shares: DoctorShareRow[];
  payouts: DoctorPayoutRow[];
  earnedPaisa: number;
  paidPaisa: number;
  /** below zero means paid ahead */
  owedPaisa: number;
}

/** Every share a doctor has earned, oldest first, on bills that stand. */
async function shareLines(doctorId: string) {
  const res = await db().execute({
    sql: `SELECT sl.id, sl.bill_id, sl.name_snapshot, sl.qty, sl.amount_paisa,
                 sl.doctor_share_paisa, ${NET_AMOUNT} AS net_amount,
                 b.invoice_no, b.date_bs, b.date_ad, b.client_created_at,
                 COALESCE(p.name, b.patient_name) AS patient_name, f.bs_label
            FROM bill_service_lines sl
            JOIN bills b ON b.id = sl.bill_id
            LEFT JOIN patients p ON p.id = b.patient_id
            LEFT JOIN fiscal_years f ON f.id = b.fiscal_year_id
           WHERE sl.doctor_id = ? AND b.status = 'saved' AND sl.doctor_share_paisa > 0
           ORDER BY b.date_ad, b.client_created_at, sl.rowid`,
    args: [doctorId],
  });
  return res.rows.map((r: Row) => ({
    lineId: r.id as string,
    billId: r.bill_id as string,
    billLabel:
      r.invoice_no != null
        ? formatDocNo("SI", (r.bs_label as string) ?? "", Number(r.invoice_no))
        : "(no number)",
    dateBs: r.date_bs as string,
    dateAd: r.date_ad as string,
    patientName: (r.patient_name as string | null) ?? "",
    service: r.name_snapshot as string,
    qty: Number(r.qty),
    billedPaisa: Number(r.net_amount),
    earnedPaisa: earnedAfterRefunds(
      Number(r.doctor_share_paisa),
      Number(r.amount_paisa),
      Number(r.net_amount),
    ),
  }));
}

/** A doctor's whole account: every share, every payout, and the balance. */
export async function doctorPayStatement(doctorId: string): Promise<DoctorPayStatement | null> {
  const doc = await db().execute({
    sql: "SELECT id, name, share_basis FROM doctors WHERE id = ?",
    args: [doctorId],
  });
  const d = doc.rows[0];
  if (!d) return null;

  const [lines, pay] = await Promise.all([
    shareLines(doctorId),
    db().execute({
      sql: `SELECT dp.*, u.name AS user_name FROM doctor_payouts dp
              LEFT JOIN users u ON u.id = dp.user_id
             WHERE dp.doctor_id = ?
             ORDER BY dp.date_ad, dp.created_at`,
      args: [doctorId],
    }),
  ]);

  const standing = pay.rows.filter((r) => r.voided_at == null);
  const tally = tallyDoctorPay(
    lines.map((l) => ({ id: l.lineId, earnedPaisa: l.earnedPaisa })),
    standing.map((r) => ({ id: r.id as string, amountPaisa: Number(r.amount_paisa) })),
  );
  const labelOf = new Map(lines.map((l) => [l.lineId, l.billLabel]));

  return {
    doctorId,
    name: d.name as string,
    basis: d.share_basis as string,
    shares: lines
      .filter((l) => l.earnedPaisa > 0)
      .map((l) => {
        const t = tally.lines.get(l.lineId)!;
        return { ...l, paidPaisa: t.paidPaisa, status: t.status };
      }),
    payouts: pay.rows.map((r: Row) => {
      const t = tally.payouts.get(r.id as string);
      // One payout may clear several lines of the same bill: say the bill once.
      const byBill = new Map<string, number>();
      for (const c of t?.covers ?? []) {
        const label = labelOf.get(c.lineId) ?? "";
        byBill.set(label, (byBill.get(label) ?? 0) + c.amountPaisa);
      }
      return {
        id: r.id as string,
        dateBs: r.date_bs as string,
        dateAd: r.date_ad as string,
        amountPaisa: Number(r.amount_paisa),
        method: r.method as string,
        note: (r.note as string) ?? "",
        userName: (r.user_name as string | null) ?? "",
        createdAt: r.created_at as string,
        voided: r.voided_at != null,
        voidReason: (r.void_reason as string) ?? "",
        covers: [...byBill].map(([billLabel, amountPaisa]) => ({ billLabel, amountPaisa })),
        aheadPaisa: t?.aheadPaisa ?? 0,
      };
    }),
    earnedPaisa: tally.earnedPaisa,
    paidPaisa: tally.paidPaisa,
    owedPaisa: tally.owedPaisa,
  };
}

/** Every doctor with what they are owed now (earned less paid), for Payables. */
export async function doctorBalances(): Promise<
  { id: string; name: string; active: boolean; earnedPaisa: number; paidPaisa: number; owedPaisa: number }[]
> {
  const res = await db().execute(
    `SELECT d.id, d.name, d.active,
            COALESCE((SELECT SUM(CASE WHEN sl.amount_paisa > 0
                                      THEN sl.doctor_share_paisa * MAX(0, ${NET_AMOUNT}) / sl.amount_paisa
                                      ELSE sl.doctor_share_paisa END)
                        FROM bill_service_lines sl JOIN bills b ON b.id = sl.bill_id
                       WHERE sl.doctor_id = d.id AND b.status = 'saved'
                         AND sl.doctor_share_paisa > 0), 0) AS earned,
            COALESCE((SELECT SUM(amount_paisa) FROM doctor_payouts dp
                       WHERE dp.doctor_id = d.id AND dp.voided_at IS NULL), 0) AS paid
       FROM doctors d`,
  );
  return res.rows.map((r: Row) => {
    const earned = Number(r.earned);
    const paid = Number(r.paid);
    return {
      id: r.id as string,
      name: r.name as string,
      active: Number(r.active) === 1,
      earnedPaisa: earned,
      paidPaisa: paid,
      owedPaisa: earned - paid,
    };
  });
}

/** Paid in a period, per doctor — for the payouts report and the financial summary. */
export async function doctorPaidBetween(fromIso: string, toIso: string): Promise<Map<string, number>> {
  const res = await db().execute({
    sql: `SELECT doctor_id, SUM(amount_paisa) AS paid FROM doctor_payouts
           WHERE voided_at IS NULL AND date_ad BETWEEN ? AND ?
           GROUP BY doctor_id`,
    args: [fromIso, toIso],
  });
  return new Map(res.rows.map((r) => [r.doctor_id as string, Number(r.paid)]));
}

export async function recordDoctorPayout(input: {
  doctorId: string;
  dateAd: string;
  dateBs: string;
  amountPaisa: number;
  method: string;
  note: string;
  userId: string;
}): Promise<string> {
  const id = ulid();
  const now = new Date().toISOString();
  await db().batch(
    [
      {
        sql: `INSERT INTO doctor_payouts
                (id, doctor_id, date_ad, date_bs, amount_paisa, method, note, user_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id, input.doctorId, input.dateAd, input.dateBs, input.amountPaisa,
          input.method, input.note.trim(), input.userId, now,
        ],
      },
      {
        sql: `INSERT INTO audit_log (id, user_id, action, detail_json, at)
              VALUES (?, ?, 'doctor.payout', ?, ?)`,
        args: [
          ulid(),
          input.userId,
          JSON.stringify({
            entity: "doctor",
            entityId: input.doctorId,
            payoutId: id,
            amountPaisa: input.amountPaisa,
            method: input.method,
            dateBs: input.dateBs,
          }),
          now,
        ],
      },
    ],
    "write",
  );
  return id;
}
