/**
 * purchases.ts — purchase entry (stock in) and purchase returns.
 * A purchase creates one batch per line and raises stock via stock_moves,
 * all inside a single atomic libSQL batch (Architecture §2.2).
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { InStatement, Row } from "@/lib/db";
import {
  getOpenFiscalYear,
  bootstrapCurrentFiscalYear,
} from "@/lib/repos/fiscal";
import { bsFromDbText, fiscalYearOf } from "@/lib/bs";
import { applyStockMove } from "@/lib/repos/batches";

export interface PurchaseLineInput {
  itemId: string;
  batchNo: string;
  mfgDateAd: string | null;
  expiryDateAd: string;
  unitLevel: number;
  factorToBase: number;
  qty: number; // paid quantity in the chosen unit
  freeQty: number; // bonus quantity in the chosen unit
  unitCostPaisa: number; // cost per chosen unit
  discountPaisa: number; // per-line discount
  /**
   * The selling price typed on this line, for the unit on this line (0022).
   * 0 or absent means none was given, and the item's price is left exactly as
   * it is — so every caller written before this existed behaves as it always
   * did.
   */
  sellingRatePaisa?: number;
}

export interface PurchaseInput {
  supplierId: string;
  supplierInvoiceNo: string;
  dateAd: string;
  dateBs: string;
  vatPaisa: number;
  /** taken off the whole bill after the lines were added up (0021) */
  billDiscountPaisa?: number;
  /** the supplier's rounding line, up or down (0021) */
  roundingPaisa?: number;
  lines: PurchaseLineInput[];
  userId: string;
  /**
   * Paid as the purchase was entered (0023). Absent means all of it on credit,
   * which is what every purchase was before — so every caller written before
   * this existed behaves as it always did. "full" pays the total worked out
   * here, never a figure from the browser.
   */
  payment?: { mode: "full" | "part"; amountPaisa: number; method: string };
}

export interface PurchaseTotals {
  subtotalPaisa: number;
  /** the per-line discounts added up */
  discountPaisa: number;
  /** taken off the whole bill afterwards */
  billDiscountPaisa: number;
  /** what VAT is charged on: subtotal less both discounts */
  taxablePaisa: number;
  vatPaisa: number;
  roundingPaisa: number;
  totalPaisa: number;
}

/** Compute a line's base quantities and per-base cost (bonus units lower per-base cost). */
function lineMath(l: PurchaseLineInput) {
  const paidBase = l.qty * l.factorToBase;
  const freeBase = l.freeQty * l.factorToBase;
  const totalBase = paidBase + freeBase;
  const lineCost = Math.max(0, l.qty * l.unitCostPaisa - l.discountPaisa);
  const costPerBase = totalBase > 0 ? Math.round(lineCost / totalBase) : 0;
  return { totalBase, lineCost, costPerBase };
}

/**
 * The bill as the paper reads it, in the supplier's own order: lines, their
 * discounts, the discount on the whole bill, VAT on what is left, then the
 * rounding line (D-143).
 */
export function purchaseTotals(
  lines: PurchaseLineInput[],
  vatPaisa: number,
  billDiscountPaisa = 0,
  roundingPaisa = 0,
): PurchaseTotals {
  let subtotal = 0;
  let discount = 0;
  for (const l of lines) {
    subtotal += l.qty * l.unitCostPaisa;
    discount += l.discountPaisa;
  }
  const afterLines = subtotal - discount;
  // Never more than there is to take off: a bigger figure is a typo, and a
  // negative payable would flow straight into the supplier's ledger.
  const billDiscount = Math.min(Math.max(0, Math.trunc(billDiscountPaisa)), Math.max(0, afterLines));
  const taxable = afterLines - billDiscount;
  return {
    subtotalPaisa: subtotal,
    discountPaisa: discount,
    billDiscountPaisa: billDiscount,
    taxablePaisa: taxable,
    vatPaisa,
    roundingPaisa: Math.trunc(roundingPaisa),
    totalPaisa: taxable + vatPaisa + Math.trunc(roundingPaisa),
  };
}

/**
 * Set an item's selling price for one unit, as part of a purchase.
 *
 * The same write as Items -> Set prices (`setUnitRates`): the rate on
 * `item_units`, which stays the one place a price lives, and the item's
 * `updated_at`, which `catalogVersion()` reads — without the bump every counter
 * keeps selling from its cached catalogue at the old price.
 *
 * Both statements only touch a row when the price is actually different, so a
 * purchase that re-types the price already on the item changes nothing and
 * does not make every counter refetch its catalogue for no reason. The
 * `updated_at` bump is written first so it can still see the old price.
 */
function priceStatements(
  itemId: string,
  unitLevel: number,
  ratePaisa: number,
  now: string,
): InStatement[] {
  return [
    {
      sql: `UPDATE items SET updated_at = ?
            WHERE id = ? AND EXISTS (
              SELECT 1 FROM item_units
              WHERE item_id = ? AND level = ? AND selling_rate_paisa <> ?)`,
      args: [now, itemId, itemId, unitLevel, ratePaisa],
    },
    {
      sql: `UPDATE item_units SET selling_rate_paisa = ?
            WHERE item_id = ? AND level = ? AND selling_rate_paisa <> ?`,
      args: [ratePaisa, itemId, unitLevel, ratePaisa],
    },
  ];
}

/** Create a purchase, its batches, stock moves, and lines atomically. */
export async function createPurchase(
  input: PurchaseInput,
): Promise<{ id: string; purchaseNo: string; paidPaisa: number }> {
  // Purchases are booked into the open year. A database that has never had one
  // (a fresh install) bootstraps the current year rather than refusing.
  const fy = (await getOpenFiscalYear()) ?? (await bootstrapCurrentFiscalYear());
  const seq = fy.nextPurchaseNo;
  const purchaseNo = fy
    ? `PI-${fy.bsLabel}-${String(seq).padStart(6, "0")}`
    : `PI-${String(seq).padStart(6, "0")}`;

  const totals = purchaseTotals(
    input.lines,
    input.vatPaisa,
    input.billDiscountPaisa ?? 0,
    input.roundingPaisa ?? 0,
  );
  const purchaseId = ulid();
  const now = new Date().toISOString();

  // What was handed over with this purchase. More than the bill is refused
  // rather than booked as money paid ahead: it is far more often a typo, and
  // an advance can still be paid from Payables on purpose.
  let paidPaisa = 0;
  if (input.payment) {
    paidPaisa =
      input.payment.mode === "full"
        ? totals.totalPaisa
        : Math.trunc(input.payment.amountPaisa);
    if (paidPaisa < 0) paidPaisa = 0;
    if (paidPaisa > totals.totalPaisa) {
      throw new PurchaseEditError(
        "The amount paid is more than the bill. Choose \"Paid in full\", or check the amount.",
      );
    }
  }

  const stmts: InStatement[] = [];
  stmts.push({
    sql: `INSERT INTO purchases
            (id, purchase_no, supplier_id, supplier_invoice_no, date_ad, date_bs,
             subtotal_paisa, discount_paisa, bill_discount_paisa, vat_paisa,
             rounding_paisa, total_paisa, user_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      purchaseId,
      purchaseNo,
      input.supplierId,
      input.supplierInvoiceNo,
      input.dateAd,
      input.dateBs,
      totals.subtotalPaisa,
      totals.discountPaisa,
      totals.billDiscountPaisa,
      totals.vatPaisa,
      totals.roundingPaisa,
      totals.totalPaisa,
      input.userId,
      now,
    ],
  });

  for (const l of input.lines) {
    const { totalBase, costPerBase } = lineMath(l);
    const batchId = ulid();
    stmts.push({
      sql: `INSERT INTO batches
              (id, item_id, batch_no, mfg_date_ad, expiry_date_ad,
               purchase_cost_paisa_per_base, received_base_qty, remaining_base_qty,
               supplier_id, purchase_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        batchId,
        l.itemId,
        l.batchNo,
        l.mfgDateAd,
        l.expiryDateAd,
        costPerBase,
        totalBase,
        totalBase,
        input.supplierId,
        purchaseId,
        now,
      ],
    });
    stmts.push({
      sql: `INSERT INTO stock_moves
              (id, batch_id, item_id, base_qty_delta, reason, ref_table, ref_id, user_id, at)
            VALUES (?, ?, ?, ?, 'purchase', 'purchases', ?, ?, ?)`,
      args: [ulid(), batchId, l.itemId, totalBase, purchaseId, input.userId, now],
    });
    stmts.push({
      sql: `INSERT INTO purchase_lines
              (id, purchase_id, item_id, batch_id, unit_level, qty, free_qty, cost_paisa,
               discount_paisa, selling_rate_paisa)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ulid(),
        purchaseId,
        l.itemId,
        batchId,
        l.unitLevel,
        l.qty,
        l.freeQty,
        l.unitCostPaisa,
        l.discountPaisa,
        Math.max(0, l.sellingRatePaisa ?? 0),
      ],
    });
    if ((l.sellingRatePaisa ?? 0) > 0) {
      stmts.push(...priceStatements(l.itemId, l.unitLevel, l.sellingRatePaisa!, now));
    }
  }

  // The payment is an ordinary supplier payment, so the supplier's balance is
  // worked out exactly as before; `purchase_id` only says which purchase it
  // came with (0023). Written after the purchase row it points at.
  if (paidPaisa > 0) {
    const paymentId = ulid();
    stmts.push({
      sql: `INSERT INTO supplier_payments
              (id, supplier_id, date_ad, date_bs, amount_paisa, method, note,
               purchase_id, user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        paymentId,
        input.supplierId,
        input.dateAd,
        input.dateBs,
        paidPaisa,
        input.payment!.method,
        `With purchase ${purchaseNo}`,
        purchaseId,
        input.userId,
        now,
      ],
    });
    stmts.push({
      sql: `INSERT INTO audit_log (id, user_id, action, detail_json, at)
            VALUES (?, ?, 'supplier.payment', ?, ?)`,
      args: [
        ulid(),
        input.userId,
        JSON.stringify({
          entity: "supplier",
          entityId: input.supplierId,
          paymentId,
          purchaseId,
          purchaseNo,
          amountPaisa: paidPaisa,
          method: input.payment!.method,
          dateBs: input.dateBs,
        }),
        now,
      ],
    });
  }

  // advance the purchase sequence (guarded against a concurrent writer)
  if (fy) {
    stmts.push({
      sql: `UPDATE fiscal_years SET next_purchase_no = next_purchase_no + 1
            WHERE id = ? AND next_purchase_no = ?`,
      args: [fy.id, seq],
    });
  }

  await db().batch(stmts);
  return { id: purchaseId, purchaseNo, paidPaisa };
}

export interface PurchaseListRow {
  id: string;
  purchaseNo: string | null;
  supplierName: string;
  supplierInvoiceNo: string;
  dateBs: string;
  dateAd: string;
  totalPaisa: number;
}

export async function listPurchases(): Promise<PurchaseListRow[]> {
  const res = await db().execute(
    `SELECT p.id, p.purchase_no, p.supplier_invoice_no, p.date_bs, p.date_ad,
            p.total_paisa, s.name AS supplier_name
     FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
     ORDER BY p.date_ad DESC, p.created_at DESC`,
  );
  return res.rows.map((r: Row) => ({
    id: r.id as string,
    purchaseNo: (r.purchase_no as string | null) ?? null,
    supplierName: r.supplier_name as string,
    supplierInvoiceNo: r.supplier_invoice_no as string,
    dateBs: r.date_bs as string,
    dateAd: r.date_ad as string,
    totalPaisa: Number(r.total_paisa),
  }));
}

export interface PurchaseReturnLineInput {
  batchId: string;
  itemId: string;
  baseQty: number;
  costPaisa: number;
}

export interface PurchaseReturnInput {
  supplierId: string;
  dateAd: string;
  dateBs: string;
  reason: string;
  lines: PurchaseReturnLineInput[];
  userId: string;
}

/** Record a purchase return: stock down (guarded), header + lines, ledger credited. */
export async function createPurchaseReturn(
  input: PurchaseReturnInput,
): Promise<string> {
  const returnId = ulid();
  const now = new Date().toISOString();
  const total = input.lines.reduce((s, l) => s + l.costPaisa, 0);

  await db().execute({
    sql: `INSERT INTO purchase_returns
            (id, return_no, supplier_id, date_ad, date_bs, reason, total_paisa, user_id, created_at)
          VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      returnId,
      input.supplierId,
      input.dateAd,
      input.dateBs,
      input.reason,
      total,
      input.userId,
      now,
    ],
  });

  for (const l of input.lines) {
    await applyStockMove({
      batchId: l.batchId,
      itemId: l.itemId,
      baseQtyDelta: -l.baseQty,
      reason: "purchase_return",
      refTable: "purchase_returns",
      refId: returnId,
      userId: input.userId,
    });
    await db().execute({
      sql: `INSERT INTO purchase_return_lines
              (id, purchase_return_id, batch_id, base_qty, cost_paisa)
            VALUES (?, ?, ?, ?, ?)`,
      args: [ulid(), returnId, l.batchId, l.baseQty, l.costPaisa],
    });
  }

  return returnId;
}

// ---------- one purchase, for reading back ----------

export interface PurchaseDetailLine {
  /** The purchase_lines row, so an edit can say which line it is changing. */
  lineId: string;
  batchId: string;
  itemId: string;
  brandName: string;
  genericName: string;
  unitName: string;
  unitLevel: number;
  batchNo: string;
  expiryDateAd: string;
  qty: number;
  freeQty: number;
  costPaisa: number;
  discountPaisa: number;
  /** qty x cost, less this line's discount — what the line adds to the bill. */
  lineTotalPaisa: number;
  /** Of what this line brought in, how much is still on the shelf. */
  remainingBaseQty: number;
  receivedBaseQty: number;
  /** The selling price set on this line (0022). 0 = none was recorded. */
  sellingRatePaisa: number;
  /**
   * Whether anything other than this purchase has moved stock in or out of
   * the batch — a sale, a return, a stock-out, a count. Once true, the line's
   * item can no longer be swapped and the line cannot be removed.
   */
  batchHasMoved: boolean;
}

export interface PurchaseDetail {
  id: string;
  purchaseNo: string | null;
  supplierId: string;
  supplierName: string;
  supplierInvoiceNo: string;
  dateBs: string;
  dateAd: string;
  subtotalPaisa: number;
  discountPaisa: number;
  billDiscountPaisa: number;
  roundingPaisa: number;
  vatPaisa: number;
  totalPaisa: number;
  enteredBy: string | null;
  createdAt: string;
  /** The most recent edit, from the audit log; null if never edited. */
  lastEdit: { byName: string; at: string } | null;
  /** Paid as it was entered (0023), undone ones included and marked. */
  payments: {
    id: string;
    amountPaisa: number;
    method: string;
    dateBs: string;
    voided: boolean;
  }[];
  lines: PurchaseDetailLine[];
}

/**
 * One purchase with its lines, for reading back what was entered.
 *
 * The unit name is read from `item_units` by the level stored on the line, so
 * a line entered in boxes reads as boxes rather than as the base quantity it
 * became. The batch's remaining quantity comes along because "what did we buy"
 * and "how much of it is left" are the same question asked twice, and the
 * person looking at a purchase is usually about to ask the second one.
 *
 * Reading only. Changing a saved purchase goes through `updatePurchase`,
 * which guards the stock it already put on the shelf.
 */
export async function getPurchase(id: string): Promise<PurchaseDetail | null> {
  const head = await db().execute({
    sql: `SELECT p.*, s.name AS supplier_name, u.name AS user_name
          FROM purchases p
          JOIN suppliers s ON s.id = p.supplier_id
          LEFT JOIN users u ON u.id = p.user_id
          WHERE p.id = ?`,
    args: [id],
  });
  if (head.rows.length === 0) return null;
  const r = head.rows[0]! as Row;

  const lines = await db().execute({
    sql: `SELECT pl.*, i.brand_name, i.generic_name,
                 b.batch_no, b.expiry_date_ad,
                 b.remaining_base_qty, b.received_base_qty,
                 iu.name AS unit_name,
                 EXISTS (
                   SELECT 1 FROM stock_moves sm
                   WHERE sm.batch_id = pl.batch_id
                     AND NOT (sm.ref_table = 'purchases' AND sm.ref_id = pl.purchase_id)
                 ) AS batch_has_moved
          FROM purchase_lines pl
          JOIN items i ON i.id = pl.item_id
          JOIN batches b ON b.id = pl.batch_id
          LEFT JOIN item_units iu
                 ON iu.item_id = pl.item_id AND iu.level = pl.unit_level
          WHERE pl.purchase_id = ?
          ORDER BY pl.rowid ASC`,
    args: [id],
  });

  // The audit log is the record of edits; there is no updated_at on the row.
  // The purchase id sits in detail_json, so this matches it as text.
  const edited = await db().execute({
    sql: `SELECT a.at, u.name AS user_name FROM audit_log a
          LEFT JOIN users u ON u.id = a.user_id
          WHERE a.action = 'purchase_edit' AND a.detail_json LIKE ?
          ORDER BY a.at DESC LIMIT 1`,
    args: [`%"purchaseId":"${id}"%`],
  });
  const paid = await db().execute({
    sql: `SELECT id, amount_paisa, method, date_bs, voided_at FROM supplier_payments
          WHERE purchase_id = ? ORDER BY created_at ASC`,
    args: [id],
  });

  const lastEdit = edited.rows[0]
    ? {
        byName: (edited.rows[0].user_name as string | null) ?? "Unknown",
        at: edited.rows[0].at as string,
      }
    : null;

  return {
    id: r.id as string,
    purchaseNo: (r.purchase_no as string | null) ?? null,
    supplierId: r.supplier_id as string,
    supplierName: r.supplier_name as string,
    supplierInvoiceNo: (r.supplier_invoice_no as string) ?? "",
    dateBs: r.date_bs as string,
    dateAd: r.date_ad as string,
    subtotalPaisa: Number(r.subtotal_paisa),
    discountPaisa: Number(r.discount_paisa),
    billDiscountPaisa: Number(r.bill_discount_paisa ?? 0),
    roundingPaisa: Number(r.rounding_paisa ?? 0),
    vatPaisa: Number(r.vat_paisa),
    totalPaisa: Number(r.total_paisa),
    enteredBy: (r.user_name as string | null) ?? null,
    createdAt: r.created_at as string,
    lastEdit,
    payments: paid.rows.map((p: Row) => ({
      id: p.id as string,
      amountPaisa: Number(p.amount_paisa),
      method: p.method as string,
      dateBs: p.date_bs as string,
      voided: p.voided_at != null,
    })),
    lines: lines.rows.map((l: Row) => {
      const qty = Number(l.qty);
      const cost = Number(l.cost_paisa);
      const discount = Number(l.discount_paisa);
      return {
        lineId: l.id as string,
        batchId: l.batch_id as string,
        itemId: l.item_id as string,
        brandName: l.brand_name as string,
        genericName: (l.generic_name as string) ?? "",
        unitName: (l.unit_name as string | null) ?? "",
        unitLevel: Number(l.unit_level),
        batchNo: l.batch_no as string,
        expiryDateAd: l.expiry_date_ad as string,
        qty,
        freeQty: Number(l.free_qty),
        costPaisa: cost,
        discountPaisa: discount,
        lineTotalPaisa: qty * cost - discount,
        remainingBaseQty: Number(l.remaining_base_qty),
        receivedBaseQty: Number(l.received_base_qty),
        sellingRatePaisa: Number(l.selling_rate_paisa ?? 0),
        batchHasMoved: Number(l.batch_has_moved) === 1,
      };
    }),
  };
}

// ---------- changing a saved purchase ----------

/** A line on an edited purchase. `lineId` present = an existing line. */
export interface PurchaseUpdateLineInput extends PurchaseLineInput {
  lineId?: string;
}

export interface PurchaseUpdateInput {
  purchaseId: string;
  supplierId: string;
  supplierInvoiceNo: string;
  dateAd: string;
  dateBs: string;
  vatPaisa: number;
  billDiscountPaisa: number;
  roundingPaisa: number;
  lines: PurchaseUpdateLineInput[];
  userId: string;
}

/**
 * A purchase save or edit refused for a reason the person can act on. (The
 * name is older than the purchase-entry payment check, which uses it too.)
 */
export class PurchaseEditError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
    this.name = "PurchaseEditError";
  }
}

interface StoredLine {
  lineId: string;
  itemId: string;
  brandName: string;
  batchId: string;
  unitLevel: number;
  qty: number;
  freeQty: number;
  costPaisa: number;
  discountPaisa: number;
  sellingRatePaisa: number;
  batchNo: string;
  expiryDateAd: string;
  receivedBaseQty: number;
  remainingBaseQty: number;
  batchHasMoved: boolean;
}

/**
 * Change a saved purchase.
 *
 * A purchase is not just a record: it created one batch per line and put that
 * stock on the shelf, and by the time anybody notices a mistake some of it may
 * be sold, returned or counted. So an edit is allowed to change anything, but
 * never to make the shelf say something that cannot be true:
 *
 *  - **Quantity** can go up freely, and down only as far as what is still on
 *    the shelf from that batch. Bought 100, sold 40: it can become 40 or more,
 *    never 30 — those 40 tablets are already in patients' hands.
 *  - **The item on a line** can only be swapped, and **a line removed**, while
 *    nothing but this purchase has touched its batch. After a sale, the batch
 *    belongs to that bill as much as to this purchase.
 *  - **The date** stays inside the purchase's own fiscal year — the purchase
 *    number carries that year's label — and a closed year cannot be edited at
 *    all, the same as a closed year's bills.
 *
 * Stock changes are **appended** to the ledger as `adjustment` moves that point
 * back at this purchase, never written over the original `purchase` move, so
 * the stock history still shows what arrived and what was corrected. A removed
 * line's batch is emptied the same way and kept, not deleted: its history is
 * still true.
 *
 * Every figure is re-derived here from the lines, exactly as `createPurchase`
 * derives it, and the whole change — header, batches, moves, lines, prices and
 * the audit entry with before and after — commits together or not at all.
 * Each guarded UPDATE re-checks the shelf inside the transaction, so a sale
 * made at the counter while the form was open cannot be undercut.
 *
 * A selling price is written to the item only where it was **changed in this
 * edit**. Re-saving an old purchase for an unrelated fix must not put the price
 * it recorded back onto an item whose price has moved on since.
 */
export async function updatePurchase(input: PurchaseUpdateInput): Promise<void> {
  if (input.lines.length === 0) {
    throw new PurchaseEditError("A purchase needs at least one line.");
  }

  const tx = await db().transaction("write");
  try {
    const head = await tx.execute({
      sql: "SELECT * FROM purchases WHERE id = ?",
      args: [input.purchaseId],
    });
    const before = head.rows[0] as Row | undefined;
    if (!before) throw new PurchaseEditError("That purchase no longer exists.");

    // --- the fiscal year ---
    const originalFy = fiscalYearOf(bsFromDbText(before.date_bs as string));
    const newFy = fiscalYearOf(bsFromDbText(input.dateBs));
    if (originalFy.label !== newFy.label) {
      throw new PurchaseEditError(
        `The date must stay in fiscal year ${originalFy.label}.`,
      );
    }
    // Read inside the transaction, so the check and the write see one state.
    const fyRes = await tx.execute({
      sql: "SELECT status FROM fiscal_years WHERE bs_label = ?",
      args: [originalFy.label],
    });
    const fyStatus = fyRes.rows[0]?.status as string | undefined;
    if (fyStatus !== "open") {
      throw new PurchaseEditError(
        `Fiscal year ${originalFy.label} is closed, so its purchases can no longer be changed.`,
      );
    }

    // --- what is on file now ---
    const stored = await tx.execute({
      sql: `SELECT pl.*, i.brand_name, b.batch_no, b.expiry_date_ad,
                   b.received_base_qty, b.remaining_base_qty,
                   EXISTS (
                     SELECT 1 FROM stock_moves sm
                     WHERE sm.batch_id = pl.batch_id
                       AND NOT (sm.ref_table = 'purchases' AND sm.ref_id = pl.purchase_id)
                   ) AS batch_has_moved
            FROM purchase_lines pl
            JOIN items i ON i.id = pl.item_id
            JOIN batches b ON b.id = pl.batch_id
            WHERE pl.purchase_id = ?
            ORDER BY pl.rowid ASC`,
      args: [input.purchaseId],
    });
    const existing = new Map<string, StoredLine>();
    for (const r of stored.rows as Row[]) {
      existing.set(r.id as string, {
        lineId: r.id as string,
        itemId: r.item_id as string,
        brandName: r.brand_name as string,
        batchId: r.batch_id as string,
        unitLevel: Number(r.unit_level),
        qty: Number(r.qty),
        freeQty: Number(r.free_qty),
        costPaisa: Number(r.cost_paisa),
        discountPaisa: Number(r.discount_paisa),
        sellingRatePaisa: Number(r.selling_rate_paisa ?? 0),
        batchNo: r.batch_no as string,
        expiryDateAd: r.expiry_date_ad as string,
        receivedBaseQty: Number(r.received_base_qty),
        remainingBaseQty: Number(r.remaining_base_qty),
        batchHasMoved: Number(r.batch_has_moved) === 1,
      });
    }

    // Every line id sent must be one of this purchase's, and at most once.
    const seen = new Set<string>();
    for (const l of input.lines) {
      if (!l.lineId) continue;
      if (!existing.has(l.lineId) || seen.has(l.lineId)) {
        throw new PurchaseEditError(
          "The purchase changed while it was open. Reload it and make the edit again.",
        );
      }
      seen.add(l.lineId);
    }

    const now = new Date().toISOString();
    const pid = input.purchaseId;

    /** Put one batch's stock right, guarded against the shelf moving under us. */
    async function shiftBatch(
      batchId: string,
      itemId: string,
      delta: number,
      fields: { sql: string; args: (string | number | null)[] },
      brandName: string,
    ): Promise<void> {
      const res = await tx.execute({
        sql: `UPDATE batches SET ${fields.sql},
                     remaining_base_qty = remaining_base_qty + ?
              WHERE id = ? AND remaining_base_qty + ? >= 0`,
        args: [...fields.args, delta, batchId, delta],
      });
      if (Number(res.rowsAffected) !== 1) {
        throw new PurchaseEditError(
          `${brandName}: more of this batch has been sold since the purchase was opened. Reload it and try again.`,
        );
      }
      if (delta !== 0) {
        await tx.execute({
          sql: `INSERT INTO stock_moves
                  (id, batch_id, item_id, base_qty_delta, reason, ref_table, ref_id, user_id, at)
                VALUES (?, ?, ?, ?, 'adjustment', 'purchases', ?, ?, ?)`,
          args: [ulid(), batchId, itemId, delta, pid, input.userId, now],
        });
      }
    }

    /** Take a line off the purchase: empty its batch into the ledger, keep the batch. */
    async function removeLine(old: StoredLine): Promise<void> {
      if (old.batchHasMoved) {
        throw new PurchaseEditError(
          `${old.brandName} can't be removed — some of it has already been sold, used or returned.`,
        );
      }
      await shiftBatch(
        old.batchId,
        old.itemId,
        -old.remainingBaseQty,
        { sql: "received_base_qty = 0", args: [] },
        old.brandName,
      );
      await tx.execute({ sql: "DELETE FROM purchase_lines WHERE id = ?", args: [old.lineId] });
    }

    /** A line that is new to this purchase: a batch, its arrival, the line. */
    async function addLine(l: PurchaseUpdateLineInput): Promise<void> {
      const { totalBase, costPerBase } = lineMath(l);
      const batchId = ulid();
      await tx.execute({
        sql: `INSERT INTO batches
                (id, item_id, batch_no, mfg_date_ad, expiry_date_ad,
                 purchase_cost_paisa_per_base, received_base_qty, remaining_base_qty,
                 supplier_id, purchase_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          batchId, l.itemId, l.batchNo, l.mfgDateAd, l.expiryDateAd, costPerBase,
          totalBase, totalBase, input.supplierId, pid, now,
        ],
      });
      await tx.execute({
        sql: `INSERT INTO stock_moves
                (id, batch_id, item_id, base_qty_delta, reason, ref_table, ref_id, user_id, at)
              VALUES (?, ?, ?, ?, 'purchase', 'purchases', ?, ?, ?)`,
        args: [ulid(), batchId, l.itemId, totalBase, pid, input.userId, now],
      });
      await tx.execute({
        sql: `INSERT INTO purchase_lines
                (id, purchase_id, item_id, batch_id, unit_level, qty, free_qty, cost_paisa,
                 discount_paisa, selling_rate_paisa)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          ulid(), pid, l.itemId, batchId, l.unitLevel, l.qty, l.freeQty,
          l.unitCostPaisa, l.discountPaisa, Math.max(0, l.sellingRatePaisa ?? 0),
        ],
      });
      if ((l.sellingRatePaisa ?? 0) > 0) {
        for (const st of priceStatements(l.itemId, l.unitLevel, l.sellingRatePaisa!, now)) {
          await tx.execute(st);
        }
      }
    }

    // --- lines taken off ---
    for (const old of existing.values()) {
      if (!seen.has(old.lineId)) await removeLine(old);
    }

    // --- lines kept, changed, or added ---
    for (const l of input.lines) {
      const old = l.lineId ? existing.get(l.lineId) : undefined;
      if (!old) {
        await addLine(l);
        continue;
      }

      if (old.itemId !== l.itemId) {
        // A different medicine is a different batch. Only while untouched.
        if (old.batchHasMoved) {
          throw new PurchaseEditError(
            `${old.brandName} can't be changed — some of it has already been sold, used or returned.`,
          );
        }
        await removeLine(old);
        await addLine(l);
        continue;
      }

      const { totalBase, costPerBase } = lineMath(l);
      const delta = totalBase - old.receivedBaseQty;
      if (old.remainingBaseQty + delta < 0) {
        const gone = old.receivedBaseQty - old.remainingBaseQty;
        throw new PurchaseEditError(
          `${old.brandName}: ${gone} (smallest unit) is already sold, used or returned. The quantity can't go below that.`,
        );
      }
      await shiftBatch(
        old.batchId,
        old.itemId,
        delta,
        {
          // The manufacture date is not on the form, so it is left as it was.
          sql: `batch_no = ?, expiry_date_ad = ?, purchase_cost_paisa_per_base = ?,
                received_base_qty = ?, supplier_id = ?`,
          args: [l.batchNo, l.expiryDateAd, costPerBase, totalBase, input.supplierId],
        },
        old.brandName,
      );
      await tx.execute({
        sql: `UPDATE purchase_lines
              SET unit_level = ?, qty = ?, free_qty = ?, cost_paisa = ?,
                  discount_paisa = ?, selling_rate_paisa = ?
              WHERE id = ?`,
        args: [
          l.unitLevel, l.qty, l.freeQty, l.unitCostPaisa, l.discountPaisa,
          Math.max(0, l.sellingRatePaisa ?? 0), old.lineId,
        ],
      });
      // Only a price that was changed here reaches the item (see above).
      const newRate = l.sellingRatePaisa ?? 0;
      if (newRate > 0 && newRate !== old.sellingRatePaisa) {
        for (const st of priceStatements(l.itemId, l.unitLevel, newRate, now)) {
          await tx.execute(st);
        }
      }
    }

    // --- the header, re-derived from the lines ---
    const totals = purchaseTotals(
      input.lines,
      input.vatPaisa,
      input.billDiscountPaisa,
      input.roundingPaisa,
    );
    await tx.execute({
      sql: `UPDATE purchases
            SET supplier_id = ?, supplier_invoice_no = ?, date_ad = ?, date_bs = ?,
                subtotal_paisa = ?, discount_paisa = ?, bill_discount_paisa = ?,
                vat_paisa = ?, rounding_paisa = ?, total_paisa = ?
            WHERE id = ?`,
      args: [
        input.supplierId, input.supplierInvoiceNo, input.dateAd, input.dateBs,
        totals.subtotalPaisa, totals.discountPaisa, totals.billDiscountPaisa,
        totals.vatPaisa, totals.roundingPaisa, totals.totalPaisa, pid,
      ],
    });

    // Money handed over with this purchase went to whoever really supplied
    // it, so a corrected supplier takes that payment along with the bill —
    // otherwise one supplier would show paid and the other owed for the same
    // invoice (0023). Undone payments move too: they belong to this bill.
    let paymentsMoved = 0;
    if (before.supplier_id !== input.supplierId) {
      const moved = await tx.execute({
        sql: `UPDATE supplier_payments SET supplier_id = ?
              WHERE purchase_id = ? AND supplier_id = ?`,
        args: [input.supplierId, pid, before.supplier_id as string],
      });
      paymentsMoved = Number(moved.rowsAffected);
    }

    // --- the record of it, before and after ---
    await tx.execute({
      sql: `INSERT INTO audit_log (id, user_id, action, detail_json, at)
            VALUES (?, ?, 'purchase_edit', ?, ?)`,
      args: [
        ulid(),
        input.userId,
        JSON.stringify({
          purchaseId: pid,
          purchaseNo: before.purchase_no,
          before: {
            supplierId: before.supplier_id,
            supplierInvoiceNo: before.supplier_invoice_no,
            dateBs: before.date_bs,
            totalPaisa: Number(before.total_paisa),
            lines: [...existing.values()].map((o) => ({
              lineId: o.lineId, itemId: o.itemId, batchNo: o.batchNo,
              expiryDateAd: o.expiryDateAd, unitLevel: o.unitLevel, qty: o.qty,
              freeQty: o.freeQty, costPaisa: o.costPaisa,
              discountPaisa: o.discountPaisa, sellingRatePaisa: o.sellingRatePaisa,
            })),
          },
          after: {
            supplierId: input.supplierId,
            supplierInvoiceNo: input.supplierInvoiceNo,
            dateBs: input.dateBs,
            totalPaisa: totals.totalPaisa,
            lines: input.lines.map((l) => ({
              lineId: l.lineId ?? null, itemId: l.itemId, batchNo: l.batchNo,
              expiryDateAd: l.expiryDateAd, unitLevel: l.unitLevel, qty: l.qty,
              freeQty: l.freeQty, costPaisa: l.unitCostPaisa,
              discountPaisa: l.discountPaisa, sellingRatePaisa: l.sellingRatePaisa ?? 0,
            })),
          },
          ...(paymentsMoved > 0 ? { paymentsMovedToNewSupplier: paymentsMoved } : {}),
        }),
        now,
      ],
    });

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
