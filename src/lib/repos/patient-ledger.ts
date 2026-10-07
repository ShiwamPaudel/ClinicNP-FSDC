/**
 * patient-ledger.ts — gathers one patient's visits, bills, payments and
 * refunds for the history table on their card. The order and the running
 * balance are decided by `buildLedger` in `lib/patient-ledger.ts`.
 */
import "server-only";
import { db } from "@/lib/db";
import { formatDocNo } from "@/lib/invoice-number";
import { adFromIso, bsToDbText, toBS } from "@/lib/bs";
import { nepalDayIso } from "@/lib/clock";
import { OWED_AT_SALE_SQL } from "@/lib/repos/dues";
import {
  buildLedger,
  type LedgerBillInput,
  type LedgerRow,
} from "@/lib/patient-ledger";

/** The BS date a UTC timestamp falls on in Nepal. */
function nepalDateBs(iso: string): string {
  return bsToDbText(toBS(adFromIso(nepalDayIso(iso))));
}

export async function patientLedger(patientId: string): Promise<LedgerRow[]> {
  const [visitRes, billRes] = await Promise.all([
    db().execute({
      sql: `SELECT v.id, v.date_bs, v.created_at, v.complaint, v.findings, v.advice,
                   v.status, d.name AS doctor_name
              FROM visits v
              LEFT JOIN doctors d ON d.id = v.doctor_id
             WHERE v.patient_id = ?`,
      args: [patientId],
    }),
    db().execute({
      sql: `SELECT b.id, b.invoice_no, b.date_bs, b.client_created_at, b.visit_id,
                   b.total_paisa, b.status, b.credit_settled_at, f.bs_label,
                   ${OWED_AT_SALE_SQL} AS owed_at_sale_paisa
              FROM bills b
              LEFT JOIN fiscal_years f ON f.id = b.fiscal_year_id
             WHERE b.patient_id = ?`,
      args: [patientId],
    }),
  ]);

  const billIds = billRes.rows.map((r) => r.id as string);
  const inList = billIds.map(() => "?").join(",");

  const [svcRes, medRes, payRes, refundRes] =
    billIds.length === 0
      ? [null, null, null, null]
      : await Promise.all([
          db().execute({
            sql: `SELECT bill_id, name_snapshot, qty FROM bill_service_lines
                   WHERE bill_id IN (${inList}) ORDER BY rowid`,
            args: billIds,
          }),
          db().execute({
            sql: `SELECT bl.bill_id, i.brand_name, bl.qty, iu.name AS unit_name
                    FROM bill_lines bl
                    JOIN items i ON i.id = bl.item_id
                    LEFT JOIN item_units iu
                      ON iu.item_id = bl.item_id AND iu.level = bl.unit_level
                   WHERE bl.bill_id IN (${inList}) ORDER BY bl.rowid`,
            args: billIds,
          }),
          db().execute({
            sql: `SELECT bill_id, date_bs, created_at, amount_paisa, method
                    FROM due_payments
                   WHERE voided_at IS NULL AND bill_id IN (${inList})`,
            args: billIds,
          }),
          db().execute({
            sql: `SELECT bill_id, date_bs, created_at, total_paisa, against_due_paisa
                    FROM sale_returns WHERE bill_id IN (${inList})`,
            args: billIds,
          }),
        ]);

  const items = new Map<string, string[]>();
  const add = (billId: string, text: string) => {
    if (!items.has(billId)) items.set(billId, []);
    items.get(billId)!.push(text);
  };
  for (const r of svcRes?.rows ?? []) {
    const qty = Number(r.qty);
    add(r.bill_id as string, `${r.name_snapshot as string}${qty > 1 ? ` × ${qty}` : ""}`);
  }
  for (const r of medRes?.rows ?? []) {
    const unit = (r.unit_name as string | null) ?? "";
    add(r.bill_id as string, `${r.brand_name as string} × ${Number(r.qty)}${unit ? ` ${unit}` : ""}`);
  }

  const bills: LedgerBillInput[] = billRes.rows.map((r) => {
    const settledAt = (r.credit_settled_at as string | null) ?? null;
    return {
      id: r.id as string,
      label:
        r.invoice_no != null
          ? formatDocNo("SI", (r.bs_label as string) ?? "", Number(r.invoice_no))
          : "(no number)",
      dateBs: r.date_bs as string,
      at: (r.client_created_at as string | null) ?? "",
      visitId: (r.visit_id as string | null) ?? null,
      items: items.get(r.id as string) ?? [],
      totalPaisa: Number(r.total_paisa),
      owedAtSalePaisa: Number(r.owed_at_sale_paisa),
      cancelled: (r.status as string) === "cancelled",
      settledAt,
      settledDateBs: settledAt ? nepalDateBs(settledAt) : null,
    };
  });

  return buildLedger({
    visits: visitRes.rows.map((r) => ({
      id: r.id as string,
      dateBs: r.date_bs as string,
      at: (r.created_at as string | null) ?? "",
      complaint: (r.complaint as string) ?? "",
      findings: (r.findings as string) ?? "",
      advice: (r.advice as string) ?? "",
      doctorName: (r.doctor_name as string | null) ?? "",
      cancelled: (r.status as string) === "cancelled",
    })),
    bills,
    payments: (payRes?.rows ?? []).map((r) => ({
      billId: r.bill_id as string,
      dateBs: r.date_bs as string,
      at: r.created_at as string,
      amountPaisa: Number(r.amount_paisa),
      method: r.method as string,
    })),
    refunds: (refundRes?.rows ?? []).map((r) => ({
      billId: r.bill_id as string,
      dateBs: r.date_bs as string,
      at: r.created_at as string,
      totalPaisa: Number(r.total_paisa),
      againstDuePaisa: Number(r.against_due_paisa ?? 0),
    })),
  });
}
