/**
 * batches.ts — stock lives here. Quantities are base units only (Rules §1.3).
 * `batches.remaining_base_qty` is the materialized current stock; every change
 * also appends a `stock_moves` ledger row (Architecture §2.2).
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row, InValue } from "@/lib/db";
import type { ItemUnit } from "@/lib/repos/items";

export type StockMoveReason =
  | "purchase"
  | "sale"
  | "sale_return"
  | "purchase_return"
  | "write_off"
  | "adjustment"
  // the reasoned stock-out family (PRD §4A.2) — see lib/repos/adjustments.ts
  | "returned_to_supplier"
  | "disposed"
  | "damaged"
  | "lost"
  | "clinic_use"
  | "sample"
  | "count_correction"
  // what was already on the shelf when the software arrived (0014)
  | "opening";

export interface Batch {
  id: string;
  itemId: string;
  batchNo: string;
  mfgDateAd: string | null;
  expiryDateAd: string;
  costPaisaPerBase: number;
  receivedBaseQty: number;
  remainingBaseQty: number;
  supplierId: string | null;
  purchaseId: string | null;
}

function mapBatch(r: Row): Batch {
  return {
    id: r.id as string,
    itemId: r.item_id as string,
    batchNo: r.batch_no as string,
    mfgDateAd: (r.mfg_date_ad as string | null) ?? null,
    expiryDateAd: r.expiry_date_ad as string,
    costPaisaPerBase: Number(r.purchase_cost_paisa_per_base),
    receivedBaseQty: Number(r.received_base_qty),
    remainingBaseQty: Number(r.remaining_base_qty),
    supplierId: (r.supplier_id as string | null) ?? null,
    purchaseId: (r.purchase_id as string | null) ?? null,
  };
}

/**
 * Insert a batch and the stock_move that puts it on the shelf, atomically.
 *
 * `reason` is deliberately NOT defaulted. Stock arriving from a supplier and
 * stock that was already on the shelf when the software was installed are
 * different facts, and the item's own history is where somebody looks when a
 * count does not add up (0014). A default here would quietly make every
 * opening balance look like a purchase.
 */
export async function createBatchWithStock(input: {
  itemId: string;
  batchNo: string;
  mfgDateAd: string | null;
  expiryDateAd: string;
  costPaisaPerBase: number;
  baseQty: number;
  supplierId: string | null;
  purchaseId: string | null;
  userId: string;
  reason: "purchase" | "opening";
}): Promise<string> {
  const id = ulid();
  const now = new Date().toISOString();
  await db().batch([
    {
      sql: `INSERT INTO batches
              (id, item_id, batch_no, mfg_date_ad, expiry_date_ad,
               purchase_cost_paisa_per_base, received_base_qty, remaining_base_qty,
               supplier_id, purchase_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        input.itemId,
        input.batchNo,
        input.mfgDateAd,
        input.expiryDateAd,
        input.costPaisaPerBase,
        input.baseQty,
        input.baseQty,
        input.supplierId,
        input.purchaseId,
        now,
      ],
    },
    {
      sql: `INSERT INTO stock_moves
              (id, batch_id, item_id, base_qty_delta, reason, ref_table, ref_id, user_id, at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ulid(),
        id,
        input.itemId,
        input.baseQty,
        input.reason,
        // Opening stock references nothing: there is no document behind it,
        // which is the whole point of it not being a purchase.
        input.reason === "purchase" ? "purchases" : null,
        input.purchaseId,
        input.userId,
        now,
      ],
    },
  ]);
  return id;
}

/**
 * Apply a stock delta to a batch and append the ledger row, atomically.
 * A negative delta is guarded so stock can't go below zero for out-moves.
 */
export async function applyStockMove(input: {
  batchId: string;
  itemId: string;
  baseQtyDelta: number;
  reason: StockMoveReason;
  refTable: string | null;
  refId: string | null;
  userId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const guard =
    input.baseQtyDelta < 0
      ? "UPDATE batches SET remaining_base_qty = remaining_base_qty + ? WHERE id = ? AND remaining_base_qty >= ?"
      : "UPDATE batches SET remaining_base_qty = remaining_base_qty + ? WHERE id = ?";
  const updArgs: InValue[] =
    input.baseQtyDelta < 0
      ? [input.baseQtyDelta, input.batchId, -input.baseQtyDelta]
      : [input.baseQtyDelta, input.batchId];

  await db().batch([
    { sql: guard, args: updArgs },
    {
      sql: `INSERT INTO stock_moves
              (id, batch_id, item_id, base_qty_delta, reason, ref_table, ref_id, user_id, at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ulid(),
        input.batchId,
        input.itemId,
        input.baseQtyDelta,
        input.reason,
        input.refTable,
        input.refId,
        input.userId,
        now,
      ],
    },
  ]);
}

export async function getBatch(id: string): Promise<Batch | null> {
  const res = await db().execute({
    sql: "SELECT * FROM batches WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? mapBatch(res.rows[0]) : null;
}

/** All batches for an item (any state), newest-received first. */
export async function batchesForItem(itemId: string): Promise<Batch[]> {
  const res = await db().execute({
    sql: "SELECT * FROM batches WHERE item_id = ? ORDER BY expiry_date_ad ASC",
    args: [itemId],
  });
  return res.rows.map(mapBatch);
}

/** Live (sellable) batches for an item: not expired, stock remaining, FEFO order. */
export async function liveBatchesForItem(
  itemId: string,
  todayIso: string,
): Promise<Batch[]> {
  const res = await db().execute({
    sql: `SELECT * FROM batches
          WHERE item_id = ? AND remaining_base_qty > 0 AND expiry_date_ad >= ?
          ORDER BY expiry_date_ad ASC, id ASC`,
    args: [itemId, todayIso],
  });
  return res.rows.map(mapBatch);
}

/** Write off a batch's remaining stock (disposal) with a reason. */
export async function writeOffBatch(
  batchId: string,
  itemId: string,
  remainingBaseQty: number,
  userId: string,
): Promise<void> {
  if (remainingBaseQty <= 0) return;
  await applyStockMove({
    batchId,
    itemId,
    baseQtyDelta: -remainingBaseQty,
    reason: "write_off",
    refTable: "batches",
    refId: batchId,
    userId,
  });
}

// -------- aggregate stock views --------

export interface ItemStock {
  itemId: string;
  sellableBaseQty: number;
  expiredBaseQty: number;
  nearestExpiryAd: string | null;
  costValuePaisa: number; // sellable stock at cost
}

/** Per-item stock aggregates keyed by itemId. */
export async function itemStockMap(
  todayIso: string,
): Promise<Map<string, ItemStock>> {
  const map = new Map<string, ItemStock>();

  const sellable = await db().execute({
    sql: `SELECT item_id,
                 SUM(remaining_base_qty) AS qty,
                 MIN(expiry_date_ad) AS nearest,
                 SUM(remaining_base_qty * purchase_cost_paisa_per_base) AS cost
          FROM batches
          WHERE remaining_base_qty > 0 AND expiry_date_ad >= ?
          GROUP BY item_id`,
    args: [todayIso],
  });
  for (const r of sellable.rows) {
    map.set(r.item_id as string, {
      itemId: r.item_id as string,
      sellableBaseQty: Number(r.qty),
      expiredBaseQty: 0,
      nearestExpiryAd: (r.nearest as string | null) ?? null,
      costValuePaisa: Number(r.cost),
    });
  }

  const expired = await db().execute({
    sql: `SELECT item_id, SUM(remaining_base_qty) AS qty
          FROM batches
          WHERE remaining_base_qty > 0 AND expiry_date_ad < ?
          GROUP BY item_id`,
    args: [todayIso],
  });
  for (const r of expired.rows) {
    const id = r.item_id as string;
    const existing = map.get(id);
    if (existing) existing.expiredBaseQty = Number(r.qty);
    else
      map.set(id, {
        itemId: id,
        sellableBaseQty: 0,
        expiredBaseQty: Number(r.qty),
        nearestExpiryAd: null,
        costValuePaisa: 0,
      });
  }

  return map;
}

export interface BatchWithItem extends Batch {
  brandName: string;
  genericName: string;
}

function mapBatchWithItem(r: Row): BatchWithItem {
  return {
    ...mapBatch(r),
    brandName: r.brand_name as string,
    genericName: r.generic_name as string,
  };
}

/** Batches expiring within `windowDays` (and not yet expired). */
export async function nearExpiryBatches(
  todayIso: string,
  windowIso: string,
): Promise<BatchWithItem[]> {
  const res = await db().execute({
    sql: `SELECT b.*, i.brand_name, i.generic_name
          FROM batches b JOIN items i ON i.id = b.item_id
          WHERE b.remaining_base_qty > 0
            AND b.expiry_date_ad >= ? AND b.expiry_date_ad <= ?
          ORDER BY b.expiry_date_ad ASC`,
    args: [todayIso, windowIso],
  });
  return res.rows.map(mapBatchWithItem);
}

/** Batches already expired but still holding stock. */
export async function expiredBatches(todayIso: string): Promise<BatchWithItem[]> {
  const res = await db().execute({
    sql: `SELECT b.*, i.brand_name, i.generic_name
          FROM batches b JOIN items i ON i.id = b.item_id
          WHERE b.remaining_base_qty > 0 AND b.expiry_date_ad < ?
          ORDER BY b.expiry_date_ad ASC`,
    args: [todayIso],
  });
  return res.rows.map(mapBatchWithItem);
}

/** Batches still holding stock, for purchase-return selection. */
export async function returnableBatches(): Promise<BatchWithItem[]> {
  const res = await db().execute(
    `SELECT b.*, i.brand_name, i.generic_name
     FROM batches b JOIN items i ON i.id = b.item_id
     WHERE b.remaining_base_qty > 0
     ORDER BY i.brand_name ASC, b.expiry_date_ad ASC`,
  );
  return res.rows.map(mapBatchWithItem);
}

/** Every batch holding stock (any expiry), for the POS catalog snapshot. */
export async function allBatchesWithStock(): Promise<Batch[]> {
  const res = await db().execute(
    `SELECT * FROM batches WHERE remaining_base_qty > 0
     ORDER BY item_id, expiry_date_ad ASC`,
  );
  return res.rows.map(mapBatch);
}

/**
 * A monotonic-ish catalog version (latest stock move / item edit / rack edit).
 *
 * Furniture and locations are in here because the counter draws them, and
 * since 0013 neither touches `items` at all: moving a medicine to another
 * shelf writes only to `item_locations`, and renaming a rack writes only to
 * `racks`. Without both in this string a counter would keep pointing at the
 * old shelf for as long as its cache lasted. The counts catch deletions,
 * which lower no MAX.
 */
export async function catalogVersion(): Promise<string> {
  const res = await db().execute(
    `SELECT
       (SELECT IFNULL(MAX(at), '') FROM stock_moves) AS m,
       (SELECT IFNULL(MAX(updated_at), '') FROM items) AS i,
       (SELECT IFNULL(MAX(updated_at), '') FROM racks) AS k,
       (SELECT COUNT(*) FROM racks) AS n,
       (SELECT IFNULL(MAX(updated_at), '') FROM item_locations) AS l,
       (SELECT COUNT(*) FROM item_locations) AS c`,
  );
  const r = res.rows[0];
  return [
    (r?.i as string) ?? "",
    (r?.m as string) ?? "",
    (r?.k as string) ?? "",
    String(r?.n ?? 0),
    (r?.l as string) ?? "",
    String(r?.c ?? 0),
  ].join("|");
}

export interface StockMoveRow {
  at: string;
  reason: StockMoveReason;
  baseQtyDelta: number;
  batchNo: string;
  refTable: string | null;
  refId: string | null;
}

/** Item history: every stock movement touching the item, newest first. */
export async function itemHistory(itemId: string): Promise<StockMoveRow[]> {
  const res = await db().execute({
    sql: `SELECT m.at, m.reason, m.base_qty_delta, m.ref_table, m.ref_id, b.batch_no
          FROM stock_moves m JOIN batches b ON b.id = m.batch_id
          WHERE m.item_id = ?
          ORDER BY m.at DESC`,
    args: [itemId],
  });
  return res.rows.map((r) => ({
    at: r.at as string,
    reason: r.reason as StockMoveReason,
    baseQtyDelta: Number(r.base_qty_delta),
    batchNo: r.batch_no as string,
    refTable: (r.ref_table as string | null) ?? null,
    refId: (r.ref_id as string | null) ?? null,
  }));
}

export interface StockCounts {
  low: number;
  nearExpiry: number;
  expired: number;
}

/** Badge counts for the stock tabs. */
export async function stockCounts(
  todayIso: string,
  windowIso: string,
): Promise<StockCounts> {
  const low = await db().execute({
    sql: `SELECT COUNT(*) AS n FROM items i
          WHERE i.active = 1 AND i.min_stock_base_qty > 0
            AND (SELECT IFNULL(SUM(b.remaining_base_qty), 0) FROM batches b
                 WHERE b.item_id = i.id AND b.remaining_base_qty > 0
                   AND b.expiry_date_ad >= ?) < i.min_stock_base_qty`,
    args: [todayIso],
  });
  const near = await db().execute({
    sql: `SELECT COUNT(*) AS n FROM batches
          WHERE remaining_base_qty > 0 AND expiry_date_ad >= ? AND expiry_date_ad <= ?`,
    args: [todayIso, windowIso],
  });
  const exp = await db().execute({
    sql: `SELECT COUNT(*) AS n FROM batches
          WHERE remaining_base_qty > 0 AND expiry_date_ad < ?`,
    args: [todayIso],
  });
  return {
    low: Number(low.rows[0]!.n),
    nearExpiry: Number(near.rows[0]!.n),
    expired: Number(exp.rows[0]!.n),
  };
}

export interface ValuationTotals {
  costValuePaisa: number;
  salableValuePaisa: number;
}

/**
 * Whole-shop stock valuation over sellable (non-expired) stock.
 * Cost = remaining * per-base cost. Salable = remaining * base-unit selling rate
 * (level-0 rate; the conservative base measure — loose-unit pricing may differ).
 */
export async function stockValuation(
  todayIso: string,
): Promise<ValuationTotals> {
  const res = await db().execute({
    sql: `SELECT
            SUM(b.remaining_base_qty * b.purchase_cost_paisa_per_base) AS cost,
            SUM(b.remaining_base_qty * IFNULL(u.selling_rate_paisa, 0)) AS salable
          FROM batches b
          LEFT JOIN item_units u ON u.item_id = b.item_id AND u.level = 0
          WHERE b.remaining_base_qty > 0 AND b.expiry_date_ad >= ?`,
    args: [todayIso],
  });
  const r = res.rows[0];
  return {
    costValuePaisa: r ? Number(r.cost ?? 0) : 0,
    salableValuePaisa: r ? Number(r.salable ?? 0) : 0,
  };
}
