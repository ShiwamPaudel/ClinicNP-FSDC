/**
 * items.ts — the item master. All SQL for items/item_units.
 *
 * This table describes WHAT A PRODUCT IS, and nothing about one shop's copy of
 * it. Vicks VapoRub comes in a jar, and that is true in every pharmacy in
 * Nepal — which is the point: this is the table a shared Nepali catalogue can
 * be imported into and refreshed from.
 *
 * Where a shop keeps it lives in `item_locations` (0013). It used to live
 * here, on four columns, and could not have survived a catalogue refresh.
 * Selling rates live on `item_units` and are per-shop too; an import must
 * create missing items and never overwrite a rate somebody set.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import { asItemShape, type ItemShape } from "@/lib/item-shape";
import { hasNoPrice } from "@/lib/units";

export type Category = "Medicine" | "Consumable" | "Other";

export interface ItemUnit {
  level: number;
  name: string;
  factorToBase: number;
  sellingRatePaisa: number;
  isDefaultSelling: boolean;
}

export interface Item {
  id: string;
  brandName: string;
  genericName: string;
  category: Category;
  manufacturer: string;
  minStockBaseQty: number;
  controlledFlag: boolean;
  preferredSupplierId: string | null;
  active: boolean;
  shape: ItemShape;
  units: ItemUnit[];
}

export interface ItemInput {
  brandName: string;
  genericName: string;
  category: Category;
  manufacturer: string;
  minStockBaseQty: number;
  controlledFlag: boolean;
  preferredSupplierId: string | null;
  active: boolean;
  shape: ItemShape;
  units: ItemUnit[];
}

function mapItem(r: Row): Omit<Item, "units"> {
  return {
    id: r.id as string,
    brandName: r.brand_name as string,
    genericName: r.generic_name as string,
    category: r.category as Category,
    manufacturer: r.manufacturer as string,
    minStockBaseQty: Number(r.min_stock_base_qty),
    controlledFlag: Number(r.controlled_flag) === 1,
    preferredSupplierId: (r.preferred_supplier_id as string | null) ?? null,
    active: Number(r.active) === 1,
    shape: asItemShape(r.shape),
  };
}

function mapUnit(r: Row): ItemUnit {
  return {
    level: Number(r.level),
    name: r.name as string,
    factorToBase: Number(r.factor_to_base),
    sellingRatePaisa: Number(r.selling_rate_paisa),
    isDefaultSelling: Number(r.is_default_selling) === 1,
  };
}

async function unitsFor(itemId: string): Promise<ItemUnit[]> {
  const res = await db().execute({
    sql: "SELECT * FROM item_units WHERE item_id = ? ORDER BY level ASC",
    args: [itemId],
  });
  return res.rows.map(mapUnit);
}

export async function listItems(includeInactive = false): Promise<Item[]> {
  const sql = includeInactive
    ? "SELECT * FROM items ORDER BY brand_name ASC"
    : "SELECT * FROM items WHERE active = 1 ORDER BY brand_name ASC";
  const res = await db().execute(sql);
  const items = res.rows.map(mapItem);
  // fetch all units in one pass
  const unitRes = await db().execute(
    "SELECT * FROM item_units ORDER BY level ASC",
  );
  const byItem = new Map<string, ItemUnit[]>();
  for (const r of unitRes.rows) {
    const id = r.item_id as string;
    if (!byItem.has(id)) byItem.set(id, []);
    byItem.get(id)!.push(mapUnit(r));
  }
  return items.map((i) => ({ ...i, units: byItem.get(i.id) ?? [] }));
}

export async function getItem(id: string): Promise<Item | null> {
  const res = await db().execute({
    sql: "SELECT * FROM items WHERE id = ?",
    args: [id],
  });
  if (!res.rows[0]) return null;
  return { ...mapItem(res.rows[0]), units: await unitsFor(id) };
}

async function writeUnits(itemId: string, units: ItemUnit[]): Promise<void> {
  await db().execute({
    sql: "DELETE FROM item_units WHERE item_id = ?",
    args: [itemId],
  });
  for (const u of units) {
    await db().execute({
      sql: `INSERT INTO item_units
              (id, item_id, level, name, factor_to_base, selling_rate_paisa, is_default_selling)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ulid(),
        itemId,
        u.level,
        u.name,
        u.factorToBase,
        u.sellingRatePaisa,
        u.isDefaultSelling ? 1 : 0,
      ],
    });
  }
}

export async function createItem(input: ItemInput): Promise<string> {
  const id = ulid();
  const now = new Date().toISOString();
  await db().execute({
    sql: `INSERT INTO items
            (id, brand_name, generic_name, category, manufacturer,
             min_stock_base_qty, controlled_flag, preferred_supplier_id, active, shape, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.brandName,
      input.genericName,
      input.category,
      input.manufacturer,
      input.minStockBaseQty,
      input.controlledFlag ? 1 : 0,
      input.preferredSupplierId,
      input.active ? 1 : 0,
      input.shape,
      now,
      now,
    ],
  });
  await writeUnits(id, input.units);
  return id;
}

export async function updateItem(
  id: string,
  input: ItemInput,
): Promise<void> {
  await db().execute({
    sql: `UPDATE items SET
            brand_name = ?, generic_name = ?, category = ?, manufacturer = ?,
            min_stock_base_qty = ?, controlled_flag = ?,
            preferred_supplier_id = ?, active = ?, shape = ?, updated_at = ?
          WHERE id = ?`,
    args: [
      input.brandName,
      input.genericName,
      input.category,
      input.manufacturer,
      input.minStockBaseQty,
      input.controlledFlag ? 1 : 0,
      input.preferredSupplierId,
      input.active ? 1 : 0,
      input.shape,
      new Date().toISOString(),
      id,
    ],
  });
  await writeUnits(id, input.units);
}

/**
 * Set selling rates and nothing else.
 *
 * A catalogue arrives before a price list does — 211 medicines imported from a
 * spreadsheet start out unpriced, and pricing them one edit form at a time is
 * a day nobody has. This is the narrow write behind Items → Set prices: it
 * touches `selling_rate_paisa` and the item's `updated_at`, and cannot reach
 * a name, a unit factor, a shelf or a stock level however it is called.
 *
 * `updated_at` matters as much as the rates. `catalogVersion()` reads it, and
 * without the bump a counter would keep serving the cached snapshot in which
 * everything still costs nothing.
 */
export async function setUnitRates(
  itemId: string,
  rates: { level: number; sellingRatePaisa: number }[],
): Promise<void> {
  for (const r of rates) {
    await db().execute({
      sql: `UPDATE item_units SET selling_rate_paisa = ?
            WHERE item_id = ? AND level = ?`,
      args: [r.sellingRatePaisa, itemId, r.level],
    });
  }
  await db().execute({
    sql: "UPDATE items SET updated_at = ? WHERE id = ?",
    args: [new Date().toISOString(), itemId],
  });
}

/** True when nothing this item is sold by has a price yet. */
export function isUnpriced(item: Item): boolean {
  return hasNoPrice(item.units);
}
