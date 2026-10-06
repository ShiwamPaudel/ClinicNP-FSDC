/**
 * sale-returns.ts — return sold items and refund services.
 *
 * A medicine goes back to the SAME batch it was sold from (PRD 4.3.6). A
 * service does not go back anywhere — nothing was taken off a shelf — so a
 * refunded service line moves money and nothing else. On screen the two are
 * called "Return" and "Refund" respectively, because that is what they are.
 *
 * Day and sales figures adjust because the reports net returns out.
 */
import "server-only";
import {
  assertBillYearOpen,
  getOpenFiscalYear,
  ClosedFiscalYearError,
} from "@/lib/repos/fiscal";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import { splitReturn } from "@/lib/dues";
import { balanceInTx } from "@/lib/repos/dues";

export interface SaleReturnLineInput {
  billLineId: string;
  itemId: string;
  /** base units to return for this line (<= sold − already returned) */
  returnBaseQty: number;
  amountPaisa: number;
}

/** A service being refunded. Nothing returns to stock. */
export interface SaleReturnServiceLineInput {
  billServiceLineId: string;
  /** how many of the billed quantity are being refunded */
  qty: number;
  amountPaisa: number;
}

export interface SaleReturnInput {
  billId: string;
  dateAd: string;
  dateBs: string;
  lines: SaleReturnLineInput[];
  serviceLines?: SaleReturnServiceLineInput[];
  reason?: string;
  userId: string;
}

/** Quantity already refunded per service line, keyed by bill_service_line_id. */
export async function refundedQtyByServiceLine(
  billId: string,
): Promise<Map<string, number>> {
  const res = await db().execute({
    sql: `SELECT srsl.bill_service_line_id, SUM(srsl.qty) AS qty
            FROM sale_return_service_lines srsl
            JOIN sale_returns sr ON sr.id = srsl.sale_return_id
           WHERE sr.bill_id = ?
           GROUP BY srsl.bill_service_line_id`,
    args: [billId],
  });
  const map = new Map<string, number>();
  for (const r of res.rows)
    map.set(r.bill_service_line_id as string, Number(r.qty));
  return map;
}

/** base units already returned per bill line, keyed by bill_line_id. */
export async function returnedBaseByLine(
  billId: string,
): Promise<Map<string, number>> {
  const res = await db().execute({
    sql: `SELECT srl.bill_line_id, SUM(srl.base_qty) AS qty
          FROM sale_return_lines srl
          JOIN sale_returns sr ON sr.id = srl.sale_return_id
          WHERE sr.bill_id = ?
          GROUP BY srl.bill_line_id`,
    args: [billId],
  });
  const map = new Map<string, number>();
  for (const r of res.rows) map.set(r.bill_line_id as string, Number(r.qty));
  return map;
}

export async function createSaleReturn(input: SaleReturnInput): Promise<{
  id: string;
  returnNo: number;
  totalPaisa: number;
  /** taken off what the patient still owed on this bill */
  againstDuePaisa: number;
  /** handed back to the patient as money */
  handBackPaisa: number;
  intoOpenYearNote: string;
}> {
  // A closed year's figures must never change after closing (D-029). But a
  // patient who comes back in Shrawan with something bought in Ashar still
  // deserves their money, so the refund is recorded in the year that IS open,
  // carrying a reference to the original invoice. The closed year keeps the
  // sale; the open year carries the refund.
  const billRes = await db().execute({
    sql: `SELECT b.fiscal_year_id, b.invoice_no, f.status, f.bs_label
            FROM bills b
            LEFT JOIN fiscal_years f ON f.id = b.fiscal_year_id
           WHERE b.id = ?`,
    args: [input.billId],
  });
  const billRow = billRes.rows[0];
  if (!billRow) throw new Error("bill not found");

  const originalYearClosed = billRow.status === "closed";
  let fyId = billRow.fiscal_year_id as number | null;
  let intoOpenYearNote = "";

  if (originalYearClosed) {
    const open = await getOpenFiscalYear();
    if (!open) {
      // No open year at all: refuse rather than book money into a closed one.
      await assertBillYearOpen(input.billId);
      throw new ClosedFiscalYearError();
    }
    fyId = open.id;
    intoOpenYearNote = `Original invoice ${billRow.invoice_no ?? "—"} of ${billRow.bs_label ?? "an earlier year"}`;
  }

  const returnId = ulid();
  const now = new Date().toISOString();
  const total =
    input.lines.reduce((s, l) => s + l.amountPaisa, 0) +
    (input.serviceLines ?? []).reduce((s, l) => s + l.amountPaisa, 0);

  const tx = await db().transaction("write");
  try {
    let returnNo = 0;
    if (fyId != null) {
      const seq = await tx.execute({
        sql: "SELECT next_return_no FROM fiscal_years WHERE id = ?",
        args: [fyId],
      });
      returnNo = Number(seq.rows[0]!.next_return_no);
      await tx.execute({
        sql: "UPDATE fiscal_years SET next_return_no = ? WHERE id = ?",
        args: [returnNo + 1, fyId],
      });
    }

    // A bill still on dues has the return taken off what is owed first:
    // nobody is handed money for something they have not finished paying for.
    // Read inside the transaction, so a payment landing at the same moment
    // cannot be counted twice.
    const { againstDuePaisa, handBackPaisa } = splitReturn(
      total,
      await balanceInTx(tx, input.billId),
    );

    await tx.execute({
      sql: `INSERT INTO sale_returns (id, return_no, bill_id, date_ad, date_bs, total_paisa, user_id, created_at, against_due_paisa)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [returnId, returnNo || null, input.billId, input.dateAd, input.dateBs, total, input.userId, now, againstDuePaisa],
    });

    // Services: money back, nothing back to stock.
    for (const line of input.serviceLines ?? []) {
      if (line.qty <= 0) continue;
      await tx.execute({
        sql: `INSERT INTO sale_return_service_lines
                (id, sale_return_id, bill_service_line_id, qty, amount_paisa)
              VALUES (?, ?, ?, ?, ?)`,
        args: [ulid(), returnId, line.billServiceLineId, line.qty, line.amountPaisa],
      });
    }

    for (const line of input.lines) {
      if (line.returnBaseQty <= 0) continue;
      // Return stock to the ORIGINAL batches of this bill line, in allocation
      // order. Ordered by rowid, not id: ids are ULIDs, and two ULIDs minted in
      // the same millisecond sort in random order ~44% of the time, which would
      // hand the stock back to the wrong batch and mis-cost the COGS. rowid is
      // true insertion order.
      const allocs = await tx.execute({
        sql: `SELECT batch_id, base_qty FROM bill_line_batches WHERE bill_line_id = ? ORDER BY rowid`,
        args: [line.billLineId],
      });
      let remaining = line.returnBaseQty;
      const perBaseAmount =
        line.returnBaseQty > 0 ? line.amountPaisa / line.returnBaseQty : 0;
      for (const a of allocs.rows) {
        if (remaining <= 0) break;
        const give = Math.min(remaining, Number(a.base_qty));
        remaining -= give;
        await tx.execute({
          sql: "UPDATE batches SET remaining_base_qty = remaining_base_qty + ? WHERE id = ?",
          args: [give, a.batch_id as string],
        });
        await tx.execute({
          sql: `INSERT INTO stock_moves (id, batch_id, item_id, base_qty_delta, reason, ref_table, ref_id, user_id, at)
                VALUES (?, ?, ?, ?, 'sale_return', 'sale_returns', ?, ?, ?)`,
          args: [ulid(), a.batch_id as string, line.itemId, give, returnId, input.userId, now],
        });
        await tx.execute({
          sql: `INSERT INTO sale_return_lines (id, sale_return_id, bill_line_id, batch_id, base_qty, amount_paisa)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [ulid(), returnId, line.billLineId, a.batch_id as string, give, Math.round(give * perBaseAmount)],
        });
      }
    }

    await tx.commit();
    return {
      id: returnId,
      returnNo,
      totalPaisa: total,
      againstDuePaisa,
      handBackPaisa,
      /** set when the original bill's year was closed and this went into the open one */
      intoOpenYearNote,
    };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}