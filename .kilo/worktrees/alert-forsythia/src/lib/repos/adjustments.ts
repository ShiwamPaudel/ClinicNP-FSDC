/**
 * adjustments.ts — stock leaving (or being corrected onto) the shelf for a
 * reason that isn't a sale (PRD §4A.2).
 *
 * The reasons are a FIXED list, not user-configurable codes (D-035): reports
 * depend on stable reason semantics, and free-form codes make them meaningless.
 *
 * Everything reuses the proven stock machinery — guarded decrements and an
 * append-only `stock_moves` row per batch — so there is one path to stock, not
 * a second one that can drift.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import { getOpenFiscalYear, bootstrapCurrentFiscalYear } from "@/lib/repos/fiscal";

export type StockOutReason =
  | "returned_to_supplier"
  | "disposed"
  | "damaged"
  | "lost"
  | "clinic_use"
  | "sample"
  | "count_correction";

export type AdjustmentDirection = "out" | "in";

export interface ReasonSpec {
  key: StockOutReason;
  label: string;
  /** The one-line consequence shown under the tile — this is what stops the
   *  wrong choice being made (Design.md §5). */
  consequence: string;
  /** Requires a supplier to be chosen. */
  needsSupplier: boolean;
  /** Only meaningful when the Clinic module is on. */
  clinicOnly: boolean;
  /** The only reason allowed to move stock UP as well as down. */
  allowsIn: boolean;
  /** A note is mandatory. */
  needsNote: boolean;
}

/** The fixed reason list, in the order the screen shows them. */
export const STOCK_OUT_REASONS: ReasonSpec[] = [
  {
    key: "returned_to_supplier",
    label: "Returned to supplier",
    consequence: "This also credits the supplier's account.",
    needsSupplier: true,
    clinicOnly: false,
    allowsIn: false,
    needsNote: false,
  },
  {
    key: "disposed",
    label: "Expired — disposed",
    consequence: "For stock past its expiry date that is being thrown away.",
    needsSupplier: false,
    clinicOnly: false,
    allowsIn: false,
    needsNote: false,
  },
  {
    key: "damaged",
    label: "Damaged or broken",
    consequence: "Comes out of stock and counts as a loss.",
    needsSupplier: false,
    clinicOnly: false,
    allowsIn: false,
    needsNote: false,
  },
  {
    key: "lost",
    label: "Lost or missing",
    consequence: "Comes out of stock and counts as a loss.",
    needsSupplier: false,
    clinicOnly: false,
    allowsIn: false,
    needsNote: false,
  },
  {
    key: "clinic_use",
    label: "Used in the clinic",
    consequence: "Comes out of stock but is not a sale.",
    needsSupplier: false,
    clinicOnly: true,
    allowsIn: false,
    needsNote: false,
  },
  {
    key: "sample",
    label: "Given as a sample",
    consequence: "Comes out of stock with no money against it.",
    needsSupplier: false,
    clinicOnly: false,
    allowsIn: false,
    needsNote: false,
  },
  {
    key: "count_correction",
    label: "Stock count correction",
    consequence:
      "The only reason that can also add stock back. Needs a short note saying why.",
    needsSupplier: false,
    clinicOnly: false,
    allowsIn: true,
    needsNote: true,
  },
];

export function reasonSpec(key: StockOutReason): ReasonSpec {
  const spec = STOCK_OUT_REASONS.find((r) => r.key === key);
  if (!spec) throw new Error(`unknown stock-out reason: ${key}`);
  return spec;
}

/** A reason was asked to move in a direction it isn't allowed to move in. */
export class InvalidAdjustmentError extends Error {
  readonly code = "invalid_adjustment" as const;
  constructor(readonly userMessage: string) {
    super(userMessage);
    this.name = "InvalidAdjustmentError";
  }
}

/** Not enough left in a batch to take the requested quantity out. */
export class AdjustmentShortError extends Error {
  readonly code = "adjustment_short" as const;
  readonly userMessage =
    "There isn't that much left in one of the batches. Check the quantities and try again.";
  constructor() {
    super("adjustment short");
    this.name = "AdjustmentShortError";
  }
}

export interface StockOutLineInput {
  itemId: string;
  batchId: string;
  /** Always positive; the header's direction decides the sign. */
  baseQty: number;
  unitLevelEntered: number;
  qtyEntered: number;
}

export interface StockOutInput {
  direction: AdjustmentDirection;
  reason: StockOutReason;
  dateAd: string;
  dateBs: string;
  supplierId?: string | null;
  visitId?: string | null;
  note?: string;
  lines: StockOutLineInput[];
  userId: string;
}

export interface StockOutResult {
  id: string;
  adjustmentNo: number;
  totalCostPaisa: number;
  purchaseReturnId: string | null;
}

/**
 * Record a stock-out (or a count correction that adds stock back), all in one
 * transaction: guarded batch updates, one `stock_moves` row per batch carrying
 * the reason, the header and its lines, and — for a supplier return — a real
 * purchase return so the supplier ledger stays the single source of truth for
 * what the pharmacy is owed.
 */
export async function createStockOut(
  input: StockOutInput,
): Promise<StockOutResult> {
  const spec = reasonSpec(input.reason);

  if (input.direction === "in" && !spec.allowsIn) {
    throw new InvalidAdjustmentError(
      "Only a stock count correction can add stock back.",
    );
  }
  if (spec.needsSupplier && !input.supplierId) {
    throw new InvalidAdjustmentError("Choose the supplier this goes back to.");
  }
  if (spec.needsNote && !input.note?.trim()) {
    throw new InvalidAdjustmentError("Add a short note saying what happened.");
  }
  if (input.lines.length === 0) {
    throw new InvalidAdjustmentError("Add at least one medicine.");
  }
  if (input.lines.some((l) => l.baseQty <= 0)) {
    throw new InvalidAdjustmentError("Every line needs a quantity.");
  }

  const fy = (await getOpenFiscalYear()) ?? (await bootstrapCurrentFiscalYear());

  // Batch costs drive the value of the loss; read them before the transaction.
  const costByBatch = new Map<string, number>();
  for (const line of input.lines) {
    if (costByBatch.has(line.batchId)) continue;
    const res = await db().execute({
      sql: "SELECT purchase_cost_paisa_per_base FROM batches WHERE id = ?",
      args: [line.batchId],
    });
    if (!res.rows[0]) {
      throw new InvalidAdjustmentError("One of those batches no longer exists.");
    }
    costByBatch.set(
      line.batchId,
      Number(res.rows[0].purchase_cost_paisa_per_base ?? 0),
    );
  }

  const lineCost = (l: StockOutLineInput) =>
    (costByBatch.get(l.batchId) ?? 0) * l.baseQty;
  const totalCost = input.lines.reduce((s, l) => s + lineCost(l), 0);

  const adjustmentId = ulid();
  const now = new Date().toISOString();
  const sign = input.direction === "out" ? -1 : 1;
  const purchaseReturnId =
    input.reason === "returned_to_supplier" ? ulid() : null;

  const tx = await db().transaction("write");
  try {
    const seqRes = await tx.execute({
      sql: "SELECT next_stockout_no FROM fiscal_years WHERE id = ?",
      args: [fy.id],
    });
    const adjustmentNo = Number(seqRes.rows[0]!.next_stockout_no);
    await tx.execute({
      sql: "UPDATE fiscal_years SET next_stockout_no = ? WHERE id = ?",
      args: [adjustmentNo + 1, fy.id],
    });

    // A supplier return is a real purchase return, so the ledger has one source.
    if (purchaseReturnId) {
      await tx.execute({
        sql: `INSERT INTO purchase_returns
                (id, return_no, supplier_id, date_ad, date_bs, reason,
                 total_paisa, user_id, created_at)
              VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          purchaseReturnId,
          input.supplierId!,
          input.dateAd,
          input.dateBs,
          "Returned to supplier",
          totalCost,
          input.userId,
          now,
        ],
      });
    }

    await tx.execute({
      sql: `INSERT INTO stock_adjustments
              (id, adjustment_no, fiscal_year_id, direction, date_ad, date_bs,
               reason, supplier_id, visit_id, note, total_cost_paisa,
               purchase_return_id, user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        adjustmentId,
        adjustmentNo,
        fy.id,
        input.direction,
        input.dateAd,
        input.dateBs,
        input.reason,
        input.supplierId ?? null,
        input.visitId ?? null,
        input.note?.trim() ?? "",
        totalCost,
        purchaseReturnId,
        input.userId,
        now,
      ],
    });

    for (const line of input.lines) {
      const delta = sign * line.baseQty;

      // Guarded update: the WHERE clause is what makes taking out more than
      // there is impossible, exactly as it is for a sale.
      const upd =
        delta < 0
          ? {
              sql: `UPDATE batches SET remaining_base_qty = remaining_base_qty + ?
                     WHERE id = ? AND remaining_base_qty >= ?`,
              args: [delta, line.batchId, -delta],
            }
          : {
              sql: `UPDATE batches SET remaining_base_qty = remaining_base_qty + ?
                     WHERE id = ?`,
              args: [delta, line.batchId],
            };
      const res = await tx.execute(upd);
      if (res.rowsAffected !== 1) throw new AdjustmentShortError();

      await tx.execute({
        sql: `INSERT INTO stock_moves
                (id, batch_id, item_id, base_qty_delta, reason, ref_table, ref_id, user_id, at)
              VALUES (?, ?, ?, ?, ?, 'stock_adjustments', ?, ?, ?)`,
        args: [
          ulid(),
          line.batchId,
          line.itemId,
          delta,
          input.reason,
          adjustmentId,
          input.userId,
          now,
        ],
      });

      await tx.execute({
        sql: `INSERT INTO stock_adjustment_lines
                (id, adjustment_id, item_id, batch_id, base_qty,
                 unit_level_entered, qty_entered, cost_paisa)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          ulid(),
          adjustmentId,
          line.itemId,
          line.batchId,
          line.baseQty,
          line.unitLevelEntered,
          line.qtyEntered,
          lineCost(line),
        ],
      });

      if (purchaseReturnId) {
        await tx.execute({
          sql: `INSERT INTO purchase_return_lines
                  (id, purchase_return_id, batch_id, base_qty, cost_paisa)
                VALUES (?, ?, ?, ?, ?)`,
          args: [
            ulid(),
            purchaseReturnId,
            line.batchId,
            line.baseQty,
            lineCost(line),
          ],
        });
      }
    }

    await tx.execute({
      sql: `INSERT INTO audit_log (id, user_id, action, detail_json, at)
            VALUES (?, ?, 'stock_out.recorded', ?, ?)`,
      args: [
        ulid(),
        input.userId,
        JSON.stringify({
          adjustmentNo,
          reason: input.reason,
          direction: input.direction,
          lines: input.lines.length,
          totalCostPaisa: totalCost,
        }),
        now,
      ],
    });

    await tx.commit();
    return {
      id: adjustmentId,
      adjustmentNo,
      totalCostPaisa: totalCost,
      purchaseReturnId,
    };
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      // already unwound
    }
    throw err;
  }
}

// ---- reads: the register and the printed note ----

export interface StockOutListRow {
  id: string;
  adjustmentNo: number | null;
  fiscalLabel: string;
  dateBs: string;
  direction: AdjustmentDirection;
  reason: StockOutReason;
  supplierName: string | null;
  note: string;
  totalCostPaisa: number;
  lineCount: number;
  userName: string;
}

function mapRow(r: Row): StockOutListRow {
  return {
    id: r.id as string,
    adjustmentNo: r.adjustment_no != null ? Number(r.adjustment_no) : null,
    fiscalLabel: (r.bs_label as string) ?? "",
    dateBs: r.date_bs as string,
    direction: r.direction as AdjustmentDirection,
    reason: r.reason as StockOutReason,
    supplierName: (r.supplier_name as string | null) ?? null,
    note: (r.note as string) ?? "",
    totalCostPaisa: Number(r.total_cost_paisa),
    lineCount: Number(r.line_count ?? 0),
    userName: (r.user_name as string) ?? "",
  };
}

/** The stock-out register: what left the shelf in a range, and why. */
export async function listStockOuts(
  fromIso: string,
  toIso: string,
  reason?: StockOutReason | null,
): Promise<StockOutListRow[]> {
  const filtered = Boolean(reason);
  const res = await db().execute({
    sql: `SELECT a.*, f.bs_label, s.name AS supplier_name, u.name AS user_name,
                 (SELECT COUNT(*) FROM stock_adjustment_lines l
                   WHERE l.adjustment_id = a.id) AS line_count
            FROM stock_adjustments a
            LEFT JOIN fiscal_years f ON f.id = a.fiscal_year_id
            LEFT JOIN suppliers s ON s.id = a.supplier_id
            LEFT JOIN users u ON u.id = a.user_id
           WHERE a.date_ad >= ? AND a.date_ad <= ?
             ${filtered ? "AND a.reason = ?" : ""}
           ORDER BY a.created_at DESC`,
    args: filtered ? [fromIso, toIso, reason!] : [fromIso, toIso],
  });
  return res.rows.map(mapRow);
}

export interface ReasonTotal {
  reason: StockOutReason;
  entries: number;
  baseQty: number;
  costPaisa: number;
}

/** Cost value per reason — the number the owner actually wants. */
export async function stockOutTotalsByReason(
  fromIso: string,
  toIso: string,
): Promise<ReasonTotal[]> {
  const res = await db().execute({
    sql: `SELECT a.reason,
                 COUNT(DISTINCT a.id) AS entries,
                 COALESCE(SUM(l.base_qty), 0) AS base_qty,
                 COALESCE(SUM(l.cost_paisa), 0) AS cost_paisa
            FROM stock_adjustments a
            LEFT JOIN stock_adjustment_lines l ON l.adjustment_id = a.id
           WHERE a.date_ad >= ? AND a.date_ad <= ?
           GROUP BY a.reason
           ORDER BY cost_paisa DESC`,
    args: [fromIso, toIso],
  });
  return res.rows.map((r) => ({
    reason: r.reason as StockOutReason,
    entries: Number(r.entries),
    baseQty: Number(r.base_qty),
    costPaisa: Number(r.cost_paisa),
  }));
}

export interface StockOutDetailLine {
  itemId: string;
  brandName: string;
  batchNo: string;
  expiryDateAd: string;
  baseQty: number;
  unitLevelEntered: number;
  qtyEntered: number;
  unitName: string;
  costPaisa: number;
}

export interface StockOutDetail extends StockOutListRow {
  lines: StockOutDetailLine[];
}

/** One stock-out with its lines, for the printed note. */
export async function getStockOut(id: string): Promise<StockOutDetail | null> {
  const head = await db().execute({
    sql: `SELECT a.*, f.bs_label, s.name AS supplier_name, u.name AS user_name,
                 (SELECT COUNT(*) FROM stock_adjustment_lines l
                   WHERE l.adjustment_id = a.id) AS line_count
            FROM stock_adjustments a
            LEFT JOIN fiscal_years f ON f.id = a.fiscal_year_id
            LEFT JOIN suppliers s ON s.id = a.supplier_id
            LEFT JOIN users u ON u.id = a.user_id
           WHERE a.id = ?`,
    args: [id],
  });
  const h = head.rows[0];
  if (!h) return null;

  const lines = await db().execute({
    sql: `SELECT l.*, i.brand_name, b.batch_no, b.expiry_date_ad,
                 iu.name AS unit_name
            FROM stock_adjustment_lines l
            JOIN items i ON i.id = l.item_id
            JOIN batches b ON b.id = l.batch_id
            LEFT JOIN item_units iu
                   ON iu.item_id = l.item_id AND iu.level = l.unit_level_entered
           WHERE l.adjustment_id = ?
           ORDER BY l.rowid`,
    args: [id],
  });

  return {
    ...mapRow(h),
    lines: lines.rows.map((r) => ({
      itemId: r.item_id as string,
      brandName: r.brand_name as string,
      batchNo: r.batch_no as string,
      expiryDateAd: r.expiry_date_ad as string,
      baseQty: Number(r.base_qty),
      unitLevelEntered: Number(r.unit_level_entered),
      qtyEntered: Number(r.qty_entered),
      unitName: (r.unit_name as string) ?? "",
      costPaisa: Number(r.cost_paisa),
    })),
  };
}
