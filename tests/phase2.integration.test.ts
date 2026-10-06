/**
 * Phase 2 acceptance, exercised against an isolated file database.
 * Drives the real repositories end-to-end (Phases.md Phase 2 checklist).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// A unique file per run: on Windows a previous run's client can still hold
// the old file, and reusing the name is what made this suite flaky.
const DB_FILE = join(__dirname, `phase2-verify.${process.pid}-${Date.now()}.db`);

// Point the app's db() singleton at an isolated file BEFORE importing repos.
process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = "";

function splitStatements(sql: string): string[] {
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
beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
  const { __resetDbForTests } = await import("@/lib/db");
  __resetDbForTests();
  // fresh DB — remove any leftover file (and its sidecars) from a previous run
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${DB_FILE}${suffix}`, { force: true });
  }
  const raw = createClient({ url: `file:${DB_FILE}` });
  const migDir = join(__dirname, "..", "db", "migrations");
  for (const f of readdirSync(migDir).filter((n) => n.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(migDir, f), "utf8");
    for (const stmt of splitStatements(sql)) await raw.execute(stmt);
  }
  // a user for stock_moves / purchases foreign keys
  await raw.execute({
    sql: `INSERT INTO users (id, name, username, password_hash, role, created_at)
          VALUES ('verify-user', 'Verifier', 'verify', 'x', 'admin', ?)`,
    args: [new Date().toISOString()],
  });
  raw.close();
});

// AD helpers relative to "today" for expiry scenarios
function isoInDays(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const TODAY = isoInDays(0);

describe("Phase 2 — catalog, stock in, unit math", () => {
  const USER = "verify-user";
  let supplierId: string;
  let itemId: string;

  it("creates a supplier and 'ABC Med' with a 3-level unit hierarchy", async () => {
    const { createSupplier } = await import("@/lib/repos/suppliers");
    const { createItem } = await import("@/lib/repos/items");
    supplierId = await createSupplier({
      name: "Citizen Pharma Sample",
      panNo: "300111222",
      phone: "01-4000000",
      address: "Kathmandu",
      contactPerson: "Ram",
      terms: "30 days",
      active: true,
    });
    itemId = await createItem({
      brandName: "ABC Med",
      genericName: "Amoxicillin 500",
      category: "Medicine",
      manufacturer: "Citizen Pharma",
      minStockBaseQty: 30,
      controlledFlag: false,
      shape: "capsule",
      preferredSupplierId: supplierId,
      active: true,
      units: [
        { level: 0, name: "Tablet", factorToBase: 1, sellingRatePaisa: 200, isDefaultSelling: false },
        { level: 1, name: "Strip", factorToBase: 10, sellingRatePaisa: 1800, isDefaultSelling: true },
        { level: 2, name: "Box", factorToBase: 60, sellingRatePaisa: 10500, isDefaultSelling: false },
      ],
    });
    expect(supplierId).toBeTruthy();
    expect(itemId).toBeTruthy();
  });

  it("purchase of 2 Boxes raises stock; display shows '2 Box' (never base units)", async () => {
    const { createPurchase } = await import("@/lib/repos/purchases");
    const { itemStockMap } = await import("@/lib/repos/batches");
    const { toMixedDisplay } = await import("@/lib/units");
    const { getItem } = await import("@/lib/repos/items");

    await createPurchase({
      supplierId,
      supplierInvoiceNo: "INV-1",
      dateAd: TODAY,
      dateBs: "2083-04-01",
      vatPaisa: 0,
      userId: USER,
      lines: [
        {
          itemId,
          batchNo: "B-FAR",
          mfgDateAd: null,
          expiryDateAd: isoInDays(400),
          unitLevel: 2, // Box
          factorToBase: 60,
          qty: 2,
          freeQty: 0,
          unitCostPaisa: 9000,
          discountPaisa: 0,
        },
      ],
    });

    const stock = await itemStockMap(TODAY);
    const item = await getItem(itemId);
    expect(stock.get(itemId)!.sellableBaseQty).toBe(120);
    expect(toMixedDisplay(120, item!.units)).toBe("2 Box");
  });

  it("second batch with a nearer expiry combines stock and becomes the nearest", async () => {
    const { createPurchase } = await import("@/lib/repos/purchases");
    const { itemStockMap } = await import("@/lib/repos/batches");
    const near = isoInDays(45);
    await createPurchase({
      supplierId,
      supplierInvoiceNo: "INV-2",
      dateAd: TODAY,
      dateBs: "2083-04-02",
      vatPaisa: 0,
      userId: USER,
      lines: [
        {
          itemId,
          batchNo: "B-NEAR",
          mfgDateAd: null,
          expiryDateAd: near,
          unitLevel: 1, // 3 strips
          factorToBase: 10,
          qty: 3,
          freeQty: 0,
          unitCostPaisa: 1500,
          discountPaisa: 0,
        },
      ],
    });
    const stock = await itemStockMap(TODAY);
    expect(stock.get(itemId)!.sellableBaseQty).toBe(150); // 120 + 30
    expect(stock.get(itemId)!.nearestExpiryAd).toBe(near);
  });

  it("item with 45-day expiry shows in Near-expiry at 60d window, gone at 30d", async () => {
    const { nearExpiryBatches } = await import("@/lib/repos/batches");
    const at60 = await nearExpiryBatches(TODAY, isoInDays(60));
    expect(at60.some((b) => b.batchNo === "B-NEAR")).toBe(true);
    const at30 = await nearExpiryBatches(TODAY, isoInDays(30));
    expect(at30.some((b) => b.batchNo === "B-NEAR")).toBe(false);
  });

  it("purchase return of 1 strip (10 base) reduces stock and credits the ledger", async () => {
    const { createPurchaseReturn } = await import("@/lib/repos/purchases");
    const { itemStockMap } = await import("@/lib/repos/batches");
    const { supplierBalance } = await import("@/lib/repos/suppliers");
    const { batchesForItem } = await import("@/lib/repos/batches");

    const before = await supplierBalance(supplierId);
    const batches = await batchesForItem(itemId);
    const near = batches.find((b) => b.batchNo === "B-NEAR")!;

    await createPurchaseReturn({
      supplierId,
      dateAd: TODAY,
      dateBs: "2083-04-03",
      reason: "near expiry",
      userId: USER,
      lines: [
        { batchId: near.id, itemId, baseQty: 10, costPaisa: 10 * near.costPaisaPerBase },
      ],
    });

    const stock = await itemStockMap(TODAY);
    expect(stock.get(itemId)!.sellableBaseQty).toBe(140); // 150 - 10
    const after = await supplierBalance(supplierId);
    expect(after).toBe(before - 10 * near.costPaisaPerBase);
  });

  it("an expired batch appears only in Expired, and write-off zeroes it with a ledger move", async () => {
    const { createPurchase } = await import("@/lib/repos/purchases");
    const { expiredBatches, itemStockMap, writeOffBatch, getBatch } =
      await import("@/lib/repos/batches");
    const { db } = await import("@/lib/db");

    await createPurchase({
      supplierId,
      supplierInvoiceNo: "INV-OLD",
      dateAd: TODAY,
      dateBs: "2083-04-01",
      vatPaisa: 0,
      userId: USER,
      lines: [
        {
          itemId,
          batchNo: "B-EXP",
          mfgDateAd: null,
          expiryDateAd: isoInDays(-5), // already expired
          unitLevel: 1,
          factorToBase: 10,
          qty: 2,
          freeQty: 0,
          unitCostPaisa: 1500,
          discountPaisa: 0,
        },
      ],
    });

    // expired stock is NOT counted as sellable
    const stock = await itemStockMap(TODAY);
    expect(stock.get(itemId)!.sellableBaseQty).toBe(140);
    expect(stock.get(itemId)!.expiredBaseQty).toBe(20);

    const expired = await expiredBatches(TODAY);
    const exp = expired.find((b) => b.batchNo === "B-EXP")!;
    expect(exp).toBeTruthy();

    await writeOffBatch(exp.id, itemId, exp.remainingBaseQty, USER);
    const after = await getBatch(exp.id);
    expect(after!.remainingBaseQty).toBe(0);

    const moves = await db().execute({
      sql: "SELECT reason FROM stock_moves WHERE batch_id = ? AND reason = 'write_off'",
      args: [exp.id],
    });
    expect(moves.rows.length).toBe(1);
  });

  it("stock valuation totals match a hand calculation", async () => {
    const { stockValuation } = await import("@/lib/repos/batches");
    const v = await stockValuation(TODAY);
    // Live sellable base after all ops = 140 (B-FAR 120 @cost150/base) + (B-NEAR 20 @cost150/base)
    // B-FAR: 2 boxes = 120 base, cost 9000/box -> 150/base -> 120*150 = 18,000
    // B-NEAR: started 30 base @ (1500/strip=150/base), returned 10 -> 20 base -> 20*150 = 3,000
    expect(v.costValuePaisa).toBe(120 * 150 + 20 * 150);
    // salable at base rate 200/tablet: 140 * 200 = 28,000
    expect(v.salableValuePaisa).toBe(140 * 200);
  });
});
