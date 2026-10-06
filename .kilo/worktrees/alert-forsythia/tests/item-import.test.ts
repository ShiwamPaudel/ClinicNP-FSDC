/**
 * Reading a catalogue out of a spreadsheet.
 *
 * These tests care about one thing above the rest: that a row this cannot
 * read becomes an error somebody can act on, never an item with a wrong
 * number quietly inside it. A catalogue is the table nobody re-checks, so a
 * hundred-fold unit error entered on day one is found by a stock count in
 * three months and by nothing before that.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseCsv, readCsv, missingColumns } from "@/lib/csv";
import {
  parseItemRow,
  parseItemFile,
  REQUIRED_ITEM_COLUMNS,
} from "@/lib/item-import";

const __dirname = dirname(fileURLToPath(import.meta.url));

const HEADER =
  "brand_name,generic_name,category,manufacturer,shape,controlled,reorder_level_base," +
  "unit1_name,unit1_rate,unit2_name,unit2_per_unit1,unit2_rate," +
  "unit3_name,unit3_per_unit2,unit3_rate,default_sell_unit";

/** One data row under the standard header. */
function oneRow(line: string) {
  const table = readCsv(`${HEADER}\n${line}\n`);
  return parseItemRow(table.records[0]!);
}

describe("reading the file Excel actually writes", () => {
  it("keeps a comma that is inside a quoted product name", () => {
    const rows = parseCsv('a,b\n"Vicks VapoRub, 25g",Medicine\n');
    expect(rows[1]).toEqual(["Vicks VapoRub, 25g", "Medicine"]);
  });

  it("reads a doubled quote as one quote", () => {
    const rows = parseCsv('a\n"He said ""no"""\n');
    expect(rows[1]).toEqual(['He said "no"']);
  });

  it("strips the byte-order mark Excel adds to CSV UTF-8", () => {
    // Left in place the BOM glues itself to the first header name and every
    // lookup of brand_name silently misses.
    const table = readCsv("﻿brand_name,category\nCetamol,Medicine\n");
    expect(table.headers[0]).toBe("brand_name");
    expect(table.records[0]!.get("brand_name")).toBe("Cetamol");
  });

  it("handles Windows line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("stops at the first blank row", () => {
    // Excel leaves a thousand empty rows below the last one somebody typed.
    const table = readCsv("brand_name\nCetamol\n\nGarbage\n");
    expect(table.records).toHaveLength(1);
  });

  it("names the columns a file cannot be read without", () => {
    const table = readCsv("brand_name,category\nx,Medicine\n");
    expect(missingColumns(table, REQUIRED_ITEM_COLUMNS)).toEqual(["unit1_name"]);
  });
});

describe("the units, which are the part that goes wrong", () => {
  it("builds factors from the smallest unit up", () => {
    const res = oneRow("Cetamol,Paracetamol,Medicine,,tablet,No,100,Tablet,2,Strip,10,18,Box,10,170,2");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.item.units.map((u) => [u.name, u.factorToBase])).toEqual([
      ["Tablet", 1],
      ["Strip", 10],
      // 10 strips of 10 tablets is 100 tablets, not 10 and not 1000.
      ["Box", 100],
    ]);
  });

  it("refuses a box that counts tablets instead of strips", () => {
    // 100 here would mean 100 strips in a box: a thousand tablets on a shelf
    // holding a hundred. It is accepted as a number, so only the wording of
    // the error saves anybody.
    const res = oneRow("X,,Medicine,,tablet,No,,Tablet,2,Strip,10,18,Box,,170,1");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain("unit3_per_unit2");
    expect(res.error.message).toContain("not how many");
  });

  it("refuses a box of nothing", () => {
    const res = oneRow("X,,Medicine,,tablet,No,,Tablet,2,,,,Box,10,170,1");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain("box has to be a box of something");
  });

  it("refuses a next size up that holds one", () => {
    const res = oneRow("X,,Medicine,,tablet,No,,Tablet,2,Strip,1,18,,,,1");
    expect(res.ok).toBe(false);
  });

  it("marks the unit the counter should offer first", () => {
    const res = oneRow("X,,Medicine,,tablet,No,,Tablet,2,Strip,10,18,,,,2");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.item.units.find((u) => u.isDefaultSelling)?.name).toBe("Strip");
  });

  it("refuses a default unit the item does not have", () => {
    const res = oneRow("X,,Medicine,,tablet,No,,Tablet,2,,,,,,,3");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain("1 unit");
  });

  it("accepts a single-unit item with everything else blank", () => {
    const res = oneRow("Dettol 250ml,Chloroxylenol,Consumable,Reckitt,bottle,No,6,Bottle,320,,,,,,,1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.item.units).toHaveLength(1);
    expect(res.item.units[0]!.sellingRatePaisa).toBe(32000);
  });
});

describe("money", () => {
  it("reads rupees and paisa as integer paisa", () => {
    const res = oneRow("X,,Medicine,,tablet,No,,Tablet,18.50,,,,,,,1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.item.units[0]!.sellingRatePaisa).toBe(1850);
  });

  it("treats a blank price as no price, not as free", () => {
    // The catalogue routinely arrives before the price list. Zero here means
    // "unpriced"; what stops it reaching a bill is the counter, not this.
    const res = oneRow("X,,Medicine,,tablet,No,,Tablet,,,,,,,,1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.item.units[0]!.sellingRatePaisa).toBe(0);
  });

  it("refuses a price with letters or thousands separators in it", () => {
    expect(oneRow("X,,Medicine,,tablet,No,,Tablet,1200.00.5,,,,,,,1").ok).toBe(false);
    expect(oneRow("X,,Medicine,,tablet,No,,Tablet,1;200,,,,,,,1").ok).toBe(false);
  });

  it("tolerates a currency prefix somebody typed anyway", () => {
    const res = oneRow("X,,Medicine,,tablet,No,,Tablet,Rs 18,,,,,,,1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.item.units[0]!.sellingRatePaisa).toBe(1800);
  });
});

describe("the rest of the row", () => {
  it("refuses an unknown category rather than guessing one", () => {
    const res = oneRow("X,,Tablets,,tablet,No,,Tablet,2,,,,,,,1");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain("Medicine, Consumable or Other");
  });

  it("refuses an unknown shape, because a typo should be visible", () => {
    expect(oneRow("X,,Medicine,,pill,No,,Tablet,2,,,,,,,1").ok).toBe(false);
  });

  it("falls back to a default shape only when the column is empty", () => {
    const res = oneRow("X,,Medicine,,,No,,Tablet,2,,,,,,,1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.item.shape).toBe("tablet");
  });

  it("reads Yes/No however a human writes it, and blank as No", () => {
    const yes = oneRow("X,,Medicine,,tablet,yes,,Tablet,2,,,,,,,1");
    expect(yes.ok && yes.item.controlledFlag).toBe(true);
    const blank = oneRow("X,,Medicine,,tablet,,,Tablet,2,,,,,,,1");
    expect(blank.ok && blank.item.controlledFlag).toBe(false);
  });

  it("refuses a controlled column it cannot read", () => {
    expect(oneRow("X,,Medicine,,tablet,maybe,,Tablet,2,,,,,,,1").ok).toBe(false);
  });

  it("refuses a nameless row", () => {
    expect(oneRow(",Paracetamol,Medicine,,tablet,No,,Tablet,2,,,,,,,1").ok).toBe(false);
  });
});

describe("a whole file", () => {
  it("collects every bad row instead of stopping at the first", () => {
    const { items, errors } = parseItemFile(
      readCsv(
        `${HEADER}\n` +
          "Good,,Medicine,,tablet,No,,Tablet,2,,,,,,,1\n" +
          "Bad1,,Nonsense,,tablet,No,,Tablet,2,,,,,,,1\n" +
          "Bad2,,Medicine,,pill,No,,Tablet,2,,,,,,,1\n",
      ),
    );
    expect(items).toHaveLength(1);
    expect(errors.map((e) => e.rowNumber)).toEqual([3, 4]);
  });

  it("reports the same medicine listed twice rather than importing one", () => {
    const { items, errors } = parseItemFile(
      readCsv(
        `${HEADER}\n` +
          "Cetamol 500mg,,Medicine,,tablet,No,,Tablet,2,,,,,,,1\n" +
          "cetamol 500mg,,Medicine,,tablet,No,,Tablet,3,,,,,,,1\n",
      ),
    );
    expect(items).toHaveLength(1);
    expect(errors[0]!.message).toContain("already appears on row 2");
  });
});

describe("the catalogue that ships with the software", () => {
  const csv = readFileSync(
    join(__dirname, "..", "import-templates", "pharmacy-items.STARTER.csv"),
    "utf8",
  );
  const table = readCsv(csv);
  const { items, errors } = parseItemFile(table);

  it("reads without a single bad row", () => {
    expect(errors).toEqual([]);
    expect(items.length).toBeGreaterThan(400);
  });

  it("carries no prices, because every price in it would be invented", () => {
    const priced = items.filter((i) =>
      i.units.some((u) => u.sellingRatePaisa !== 0),
    );
    expect(priced).toEqual([]);
  });

  it("names a generic for every medicine, since that is what a customer asks by", () => {
    const missing = items
      .filter((i) => i.category === "Medicine" && i.genericName === "")
      .map((i) => i.brandName);
    expect(missing).toEqual([]);
  });

  it("flags the narcotics and nothing else as controlled", () => {
    const controlled = items.filter((i) => i.controlledFlag).map((i) => i.brandName);
    // Pinned as an exact list on purpose: this is precisely what forces a
    // patient name onto a bill, and it should never grow or shrink by
    // accident. Antibiotics are deliberately absent — see the README.
    expect(controlled.sort()).toEqual([
      "Alprax 0.25",
      "Calmpose 5",
      "Codeine Phosphate Cough Syrup 100ml",
      "Etilaam 0.5",
      "Frisium 10",
      "Lonazep 0.5",
      "Tramadol Injection 2ml",
      "Tramazac 50mg",
      "Ultracet",
      "Zolfresh 10",
    ]);
  });

  it("gives every item a sellable default unit", () => {
    for (const i of items) {
      expect(
        i.units.filter((u) => u.isDefaultSelling),
        `${i.brandName} must have exactly one default unit`,
      ).toHaveLength(1);
    }
  });
});
