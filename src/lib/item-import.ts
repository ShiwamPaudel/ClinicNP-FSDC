/**
 * item-import.ts — turning one spreadsheet row into one item.
 *
 * The catalogue is the one table a shop cannot type its way out of. Three
 * hundred medicines entered by hand is a week nobody has at the moment the
 * software arrives, so it arrives as a file instead. What makes that safe is
 * everything in here refusing rather than guessing: a row it cannot read
 * becomes an error with a row number, never an item with a plausible-looking
 * wrong number in it.
 *
 * The unit columns are the reason this file is careful. `unit3_per_unit2`
 * counts STRIPS in a box, not tablets, and a box read as 100 strips instead of
 * 10 puts a thousand tablets on a shelf holding a hundred. That mistake is
 * invisible until somebody counts, so it is checked here rather than trusted.
 *
 * Pure and client-safe on purpose: the CLI importer and the tests both use it,
 * and neither should have to stand up a database to find out that row 47 has a
 * box of nothing in it.
 */
import {
  asItemShape,
  isItemShape,
  DEFAULT_ITEM_SHAPE,
  type ItemShape,
} from "./item-shape";
import { toPaisa } from "./money";
import type { CsvTable } from "./csv";

export type ImportCategory = "Medicine" | "Consumable" | "Other";

export interface ParsedUnit {
  level: number;
  name: string;
  factorToBase: number;
  sellingRatePaisa: number;
  isDefaultSelling: boolean;
}

export interface ParsedItem {
  rowNumber: number;
  brandName: string;
  genericName: string;
  category: ImportCategory;
  manufacturer: string;
  minStockBaseQty: number;
  controlledFlag: boolean;
  shape: ItemShape;
  units: ParsedUnit[];
}

export interface RowError {
  rowNumber: number;
  /** What the row was trying to be, so an error names something recognisable. */
  label: string;
  message: string;
}

export const ITEM_COLUMNS = [
  "brand_name",
  "generic_name",
  "category",
  "manufacturer",
  "shape",
  "controlled",
  "reorder_level_base",
  "unit1_name",
  "unit1_rate",
  "unit2_name",
  "unit2_per_unit1",
  "unit2_rate",
  "unit3_name",
  "unit3_per_unit2",
  "unit3_rate",
  "default_sell_unit",
] as const;

/** The columns a file cannot be read without. The rest may be absent. */
export const REQUIRED_ITEM_COLUMNS = [
  "brand_name",
  "category",
  "unit1_name",
] as const;

const CATEGORIES: ImportCategory[] = ["Medicine", "Consumable", "Other"];

/** Yes / No as a human writes it. Blank means no. */
function readYesNo(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === "") return false;
  if (["yes", "y", "true", "1"].includes(v)) return true;
  if (["no", "n", "false", "0"].includes(v)) return false;
  return null;
}

/** A whole number, or null if it is not one. Blank gives `fallback`. */
function readInt(raw: string, fallback: number | null): number | null {
  const v = raw.trim();
  if (v === "") return fallback;
  if (!/^\d+$/.test(v)) return null;
  return Number(v);
}

/**
 * Rupees as typed, in paisa. Blank is 0 — an unpriced item, which is a real
 * and expected state: a catalogue can arrive before a price list does.
 */
function readRupees(raw: string): number | null {
  const v = raw.trim().replace(/^(रू|Rs\.?|NPR)\s*/i, "");
  if (v === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  return toPaisa(Number(v));
}

/**
 * Read one row. Returns the item or the reason it could not be read; never
 * both, and never a half-built item.
 */
export function parseItemRow(row: {
  rowNumber: number;
  get: (c: string) => string;
}): { ok: true; item: ParsedItem } | { ok: false; error: RowError } {
  const brandName = row.get("brand_name").trim();
  const label = brandName || "(no name)";
  const fail = (message: string) => ({
    ok: false as const,
    error: { rowNumber: row.rowNumber, label, message },
  });

  if (!brandName) return fail("brand_name is empty — every item needs a name.");

  const rawCategory = row.get("category").trim();
  const category = CATEGORIES.find(
    (c) => c.toLowerCase() === rawCategory.toLowerCase(),
  );
  if (!category) {
    return fail(
      `category is "${rawCategory}" — it must be Medicine, Consumable or Other.`,
    );
  }

  const rawShape = row.get("shape").trim().toLowerCase();
  if (rawShape !== "" && !isItemShape(rawShape)) {
    return fail(`shape is "${rawShape}", which is not one of the known shapes.`);
  }
  const shape: ItemShape =
    rawShape === "" ? DEFAULT_ITEM_SHAPE : asItemShape(rawShape);

  const controlled = readYesNo(row.get("controlled"));
  if (controlled === null) {
    return fail(`controlled is "${row.get("controlled")}" — write Yes or No.`);
  }

  const minStock = readInt(row.get("reorder_level_base"), 0);
  if (minStock === null) {
    return fail("reorder_level_base must be a whole number, or empty.");
  }

  // --- units -------------------------------------------------------------
  const u1Name = row.get("unit1_name").trim();
  if (!u1Name) {
    return fail("unit1_name is empty — every item needs its smallest unit.");
  }
  const u1Rate = readRupees(row.get("unit1_rate"));
  if (u1Rate === null) return fail("unit1_rate is not a plain number of rupees.");

  const units: ParsedUnit[] = [
    {
      level: 0,
      name: u1Name,
      factorToBase: 1,
      sellingRatePaisa: u1Rate,
      isDefaultSelling: false,
    },
  ];

  const u2Name = row.get("unit2_name").trim();
  const u3Name = row.get("unit3_name").trim();

  if (u2Name) {
    const per = readInt(row.get("unit2_per_unit1"), null);
    if (per === null || per < 2) {
      return fail(
        `unit2_per_unit1 must say how many ${u1Name.toLowerCase()}s make one ${u2Name.toLowerCase()} (2 or more).`,
      );
    }
    const rate = readRupees(row.get("unit2_rate"));
    if (rate === null) return fail("unit2_rate is not a plain number of rupees.");
    units.push({
      level: 1,
      name: u2Name,
      factorToBase: per,
      sellingRatePaisa: rate,
      isDefaultSelling: false,
    });
  }

  if (u3Name) {
    if (!u2Name) {
      return fail(
        `unit3_name is "${u3Name}" but unit2_name is empty — a box has to be a box of something.`,
      );
    }
    const per = readInt(row.get("unit3_per_unit2"), null);
    if (per === null || per < 2) {
      return fail(
        `unit3_per_unit2 must say how many ${u2Name.toLowerCase()}s make one ${u3Name.toLowerCase()} (2 or more) — not how many ${u1Name.toLowerCase()}s.`,
      );
    }
    const rate = readRupees(row.get("unit3_rate"));
    if (rate === null) return fail("unit3_rate is not a plain number of rupees.");
    units.push({
      level: 2,
      name: u3Name,
      factorToBase: units[1]!.factorToBase * per,
      sellingRatePaisa: rate,
      isDefaultSelling: false,
    });
  }

  const sell = readInt(row.get("default_sell_unit"), 1);
  if (sell === null || sell < 1 || sell > units.length) {
    return fail(
      `default_sell_unit is "${row.get("default_sell_unit")}" but this item has ${units.length} unit${units.length === 1 ? "" : "s"}.`,
    );
  }
  units[sell - 1]!.isDefaultSelling = true;

  return {
    ok: true,
    item: {
      rowNumber: row.rowNumber,
      brandName,
      genericName: row.get("generic_name").trim(),
      category,
      manufacturer: row.get("manufacturer").trim(),
      minStockBaseQty: minStock,
      controlledFlag: controlled,
      shape,
      units,
    },
  };
}

export interface ParsedItemFile {
  items: ParsedItem[];
  errors: RowError[];
}

/**
 * Read a whole file. Rows that cannot be read are collected rather than
 * thrown, so one typo on row 12 does not hide the other four on rows 40-90.
 *
 * A brand name appearing twice in the same file is an error too: the second
 * one would silently do nothing, and silently doing nothing is how a shop ends
 * up believing it imported something it did not.
 */
export function parseItemFile(table: CsvTable): ParsedItemFile {
  const items: ParsedItem[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();

  for (const row of table.records) {
    const res = parseItemRow(row);
    if (!res.ok) {
      errors.push(res.error);
      continue;
    }
    const key = res.item.brandName.toLowerCase();
    const first = seen.get(key);
    if (first !== undefined) {
      errors.push({
        rowNumber: res.item.rowNumber,
        label: res.item.brandName,
        message: `already appears on row ${first} of this file.`,
      });
      continue;
    }
    seen.set(key, res.item.rowNumber);
    items.push(res.item);
  }

  return { items, errors };
}
