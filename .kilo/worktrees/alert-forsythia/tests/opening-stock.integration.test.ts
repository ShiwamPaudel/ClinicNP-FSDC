/**
 * Opening stock — what was already on the shelf when the software arrived.
 *
 * The point of this suite is the distinction, not the arithmetic. Stock can
 * always be got onto a shelf somehow; what mattered was that doing it did not
 * require inventing a supplier and an invoice for medicines bought months ago
 * from somebody the shop no longer owes (D-077). So these tests care that an
 * opening balance owes nobody, references no document, and never claims in the
 * item's own history to have been bought.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `opening.${process.pid}-${Date.now()}.db`);

function split(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(`${DB_FILE}${suffix}`, { force: true });
    } catch {
      // a lingering handle on Windows — the unique name makes it harmless
    }
  }
});

let itemId = "";

beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
  const { __resetDbForTests } = await import("@/lib/db");
  __resetDbForTests();
  for (const s of ["", "-wal", "-shm"]) rmSync(`${DB_FILE}${s}`, { force: true });

  const c = createClient({ url: `file:${DB_FILE}` });
  const migrations = join(__dirname, "..", "db", "migrations");
  for (const f of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of split(readFileSync(join(migrations, f), "utf8"))) {
      await c.execute(stmt);
    }
  }
  await c.execute({
    sql: `INSERT INTO users (id, name, username, password_hash, role, created_at)
          VALUES ('u1','Sarita','admin','x','admin',?)`,
    args: [new Date().toISOString()],
  });
  c.close();

  const { createItem } = await import("@/lib/repos/items");
  itemId = await createItem({
    brandName: "Cetamol",
    genericName: "Paracetamol 500mg",
    category: "Medicine",
    manufacturer: "",
    minStockBaseQty: 0,
    controlledFlag: false,
    preferredSupplierId: null,
    active: true,
    shape: "tablet",
    units: [
      { level: 0, name: "Tablet", factorToBase: 1, sellingRatePaisa: 100, isDefaultSelling: true },
      { level: 1, name: "Strip", factorToBase: 10, sellingRatePaisa: 900, isDefaultSelling: false },
      { level: 2, name: "Box", factorToBase: 100, sellingRatePaisa: 8000, isDefaultSelling: false },
    ],
  });
});

/** The one stock_move written for a batch. */
async function moveFor(batchId: string) {
  const c = createClient({ url: `file:${DB_FILE}` });
  const res = await c.execute({
    sql: "SELECT * FROM stock_moves WHERE batch_id = ?",
    args: [batchId],
  });
  c.close();
  return res.rows[0];
}

describe("opening stock", () => {
  it("owes nobody and references no document", async () => {
    const { createBatchWithStock, getBatch } = await import("@/lib/repos/batches");

    const batchId = await createBatchWithStock({
      itemId,
      batchNo: "OPEN-1",
      mfgDateAd: null,
      expiryDateAd: "2028-01-01",
      costPaisaPerBase: 50,
      baseQty: 500,
      supplierId: null,
      purchaseId: null,
      userId: "u1",
      reason: "opening",
    });

    const batch = await getBatch(batchId);
    expect(batch?.supplierId).toBeNull();
    expect(batch?.purchaseId).toBeNull();

    const move = await moveFor(batchId);
    expect(move?.reason).toBe("opening");
    // A purchase move points at the purchases table. This one points nowhere,
    // because there is no document behind it.
    expect(move?.ref_table).toBeNull();
    expect(move?.ref_id).toBeNull();
    expect(Number(move?.base_qty_delta)).toBe(500);
  });

  it("is not recorded as a purchase", async () => {
    // The distinction 0014 exists for. If this ever reads 'purchase' again,
    // the item's history is lying about where its stock came from.
    const { createBatchWithStock } = await import("@/lib/repos/batches");
    const batchId = await createBatchWithStock({
      itemId,
      batchNo: "OPEN-2",
      mfgDateAd: null,
      expiryDateAd: "2028-02-01",
      costPaisaPerBase: 50,
      baseQty: 10,
      supplierId: null,
      purchaseId: null,
      userId: "u1",
      reason: "opening",
    });
    expect((await moveFor(batchId))?.reason).not.toBe("purchase");
  });

  it("still records a real purchase as a purchase", async () => {
    const { createBatchWithStock } = await import("@/lib/repos/batches");
    const batchId = await createBatchWithStock({
      itemId,
      batchNo: "BOUGHT-1",
      mfgDateAd: null,
      expiryDateAd: "2028-03-01",
      costPaisaPerBase: 60,
      baseQty: 20,
      supplierId: null,
      purchaseId: null,
      userId: "u1",
      reason: "purchase",
    });
    const move = await moveFor(batchId);
    expect(move?.reason).toBe("purchase");
    expect(move?.ref_table).toBe("purchases");
  });

  it("counts toward stock on hand and valuation like any other batch", async () => {
    const { itemStockMap, stockValuation } = await import("@/lib/repos/batches");
    const stock = await itemStockMap("2026-01-01");
    // 500 + 10 opening + 20 purchased, all in base units
    expect(stock.get(itemId)?.sellableBaseQty).toBe(530);

    const totals = await stockValuation("2026-01-01");
    // 510 base at 50 paisa + 20 base at 60 paisa
    expect(totals.costValuePaisa).toBe(510 * 50 + 20 * 60);
  });

  it("shows in the item's history as its own kind of movement", async () => {
    const { itemHistory } = await import("@/lib/repos/batches");
    const rows = await itemHistory(itemId);
    const reasons = rows.map((r) => r.reason);
    expect(reasons).toContain("opening");
    expect(reasons.filter((r) => r === "opening")).toHaveLength(2);
  });
});

describe("counting a shelf in the unit somebody counts in", () => {
  it("turns boxes into base units", async () => {
    const { openingLineToBase } = await import("@/lib/units");
    // 3 boxes of 100 is 300 tablets, and Rs 80 a box is 80 paisa a tablet.
    expect(openingLineToBase(3, 8000, 100)).toEqual({
      baseQty: 300,
      costPaisaPerBase: 80,
    });
  });

  it("leaves the base unit alone", async () => {
    const { openingLineToBase } = await import("@/lib/units");
    expect(openingLineToBase(45, 150, 1)).toEqual({
      baseQty: 45,
      costPaisaPerBase: 150,
    });
  });

  it("rounds a cost that does not divide evenly, to whole paisa", async () => {
    const { openingLineToBase } = await import("@/lib/units");
    // Rs 10 for a strip of 3 is 333.33 paisa a tablet. Money is integer paisa
    // everywhere here, so it rounds and loses a paisa across the strip.
    expect(openingLineToBase(1, 1000, 3)).toEqual({
      baseQty: 3,
      costPaisaPerBase: 333,
    });
  });

  it("does not silently turn a free sample into a cost", async () => {
    const { openingLineToBase } = await import("@/lib/units");
    expect(openingLineToBase(2, 0, 10).costPaisaPerBase).toBe(0);
  });
});
