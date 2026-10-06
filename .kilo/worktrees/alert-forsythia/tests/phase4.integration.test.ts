/**
 * Phase 4 acceptance: sell → return reconciles across stock, day-close, and
 * batch-accurate profit (two batches at different costs).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// A unique file per run: on Windows a previous run's client can still hold
// the old file, and reusing the name is what made this suite flaky.
const DB_FILE = join(__dirname, `phase4-verify.${process.pid}-${Date.now()}.db`);
process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = "";

function split(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}
function isoInDays(d: number): string {
  const x = new Date(Date.now() + d * 86400000);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
const TODAY = isoInDays(0);

let itemId: string;

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
  for (const s of ["", "-wal", "-shm"]) rmSync(`${DB_FILE}${s}`, { force: true });
  const raw = createClient({ url: `file:${DB_FILE}` });
  const migDir = join(__dirname, "..", "db", "migrations");
  for (const f of readdirSync(migDir).filter((n) => n.endsWith(".sql")).sort()) {
    for (const stmt of split(readFileSync(join(migDir, f), "utf8"))) await raw.execute(stmt);
  }
  await raw.execute({
    sql: `INSERT INTO users (id, name, username, password_hash, role, created_at)
          VALUES ('u1','Bikash','bikash','x','staff',?)`,
    args: [new Date().toISOString()],
  });
  raw.close();

  const { createItem } = await import("@/lib/repos/items");
  const { createBatchWithStock } = await import("@/lib/repos/batches");
  itemId = await createItem({
    brandName: "ABC Med", genericName: "", category: "Medicine", manufacturer: "",
    minStockBaseQty: 0, controlledFlag: false, preferredSupplierId: null, active: true, shape: "tablet",
    units: [{ level: 0, name: "Tablet", factorToBase: 1, sellingRatePaisa: 200, isDefaultSelling: true }],
  });
  // batch A cheaper + nearer expiry, batch B costlier + later
  await createBatchWithStock({
    itemId, batchNo: "A", mfgDateAd: null, expiryDateAd: isoInDays(60),
    costPaisaPerBase: 100, baseQty: 30, supplierId: null, purchaseId: null, userId: "u1", reason: "purchase",
  });
  await createBatchWithStock({
    itemId, batchNo: "B", mfgDateAd: null, expiryDateAd: isoInDays(300),
    costPaisaPerBase: 200, baseQty: 100, supplierId: null, purchaseId: null, userId: "u1", reason: "purchase",
  });
});

describe("Phase 4 — reconciliation", () => {
  it("profit uses batch-accurate COGS across two costs", async () => {
    const { ingestBill } = await import("@/lib/repos/bills");
    const { profitByItem } = await import("@/lib/repos/reports");
    await ingestBill({
      id: "bill-1", dateBs: "2083-04-05", dateAd: TODAY, patientName: "",
      paymentMethod: "cash", tenderedPaisa: 10000, billDiscountPaisa: 0,
      userId: "u1", clientCreatedAt: new Date().toISOString(),
      lines: [{ id: "L1", itemId, unitLevel: 0, qty: 40, ratePaisa: 200, rateOverridden: false, discountPaisa: 0 }],
    });
    // 40 tablets: 30@cost100 + 10@cost200 => COGS 5000, revenue 8000, profit 3000
    const p = await profitByItem(TODAY, TODAY);
    expect(p.totals.revenuePaisa).toBe(8000);
    expect(p.totals.costPaisa).toBe(5000);
    expect(p.totals.profitPaisa).toBe(3000);
  });

  it("day-close reflects the sale (cash, no VAT)", async () => {
    const { daySummary } = await import("@/lib/repos/reports");
    const d = await daySummary(TODAY);
    expect(d.billCount).toBe(1);
    expect(d.grossSalesPaisa).toBe(8000);
    expect(d.netSalesPaisa).toBe(8000);
    expect(d.byMethod.cash).toBe(8000);
    expect(d.expectedCashPaisa).toBe(8000);
  });

  it("returning 1 tablet restores stock and reconciles day-close + profit", async () => {
    const { createSaleReturn } = await import("@/lib/repos/sale-returns");
    const { daySummary, profitByItem } = await import("@/lib/repos/reports");
    const { db } = await import("@/lib/db");

    const beforeA = await db().execute("SELECT remaining_base_qty q FROM batches WHERE batch_no='A'");
    await createSaleReturn({
      billId: "bill-1", dateBs: "2083-04-05", dateAd: TODAY, userId: "u1",
      lines: [{ billLineId: "L1", itemId, returnBaseQty: 1, amountPaisa: 200 }],
    });
    const afterA = await db().execute("SELECT remaining_base_qty q FROM batches WHERE batch_no='A'");
    // stock returns to batch A (the first-allocated batch)
    expect(Number(afterA.rows[0]!.q)).toBe(Number(beforeA.rows[0]!.q) + 1);

    // day-close: returns 200, net 7800, expected cash 7800
    const d = await daySummary(TODAY);
    expect(d.returnsPaisa).toBe(200);
    expect(d.netSalesPaisa).toBe(7800);
    expect(d.expectedCashPaisa).toBe(7800);

    // profit: revenue 7800, COGS 4900 (returned tablet costed at batch A = 100), profit 2900
    const p = await profitByItem(TODAY, TODAY);
    expect(p.totals.revenuePaisa).toBe(7800);
    expect(p.totals.costPaisa).toBe(4900);
    expect(p.totals.profitPaisa).toBe(2900);
  });

  it("cancelling a bill restores stock and marks it cancelled", async () => {
    const { ingestBill, cancelBill, getBillDetail } = await import("@/lib/repos/bills");
    const { db } = await import("@/lib/db");
    await ingestBill({
      id: "bill-2", dateBs: "2083-04-05", dateAd: TODAY, patientName: "",
      paymentMethod: "cash", tenderedPaisa: 10000, billDiscountPaisa: 0,
      userId: "u1", clientCreatedAt: new Date().toISOString(),
      lines: [{ id: "L2", itemId, unitLevel: 0, qty: 5, ratePaisa: 200, rateOverridden: false, discountPaisa: 0 }],
    });
    const totalSql = "SELECT IFNULL(SUM(remaining_base_qty),0) q FROM batches WHERE item_id = '" + itemId + "'";
    const before = await db().execute(totalSql);
    await cancelBill("bill-2", "u1");
    const after = await db().execute(totalSql);
    // all 5 base units return to the shelf (across whichever batches they came from)
    expect(Number(after.rows[0]!.q)).toBe(Number(before.rows[0]!.q) + 5);
    const detail = await getBillDetail("bill-2");
    expect(detail!.status).toBe("cancelled");
    expect(detail!.invoiceNo).not.toBeNull(); // keeps its number
  });

  it("rejects a bill that would oversell — hard block, nothing written", async () => {
    const { ingestBill, InsufficientStockError } = await import("@/lib/repos/bills");
    const { db } = await import("@/lib/db");
    const totalSql =
      "SELECT IFNULL(SUM(remaining_base_qty),0) q FROM batches WHERE item_id = '" +
      itemId +
      "'";
    const before = await db().execute(totalSql);
    await expect(
      ingestBill({
        id: "bill-oversell",
        dateBs: "2083-04-05",
        dateAd: TODAY,
        patientName: "",
        paymentMethod: "cash",
        tenderedPaisa: 0,
        billDiscountPaisa: 0,
        userId: "u1",
        clientCreatedAt: new Date().toISOString(),
        lines: [
          { id: "LX", itemId, unitLevel: 0, qty: 99999, ratePaisa: 200, rateOverridden: false, discountPaisa: 0 },
        ],
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    // rolled back: stock untouched and no bill row written
    const after = await db().execute(totalSql);
    expect(Number(after.rows[0]!.q)).toBe(Number(before.rows[0]!.q));
    const b = await db().execute("SELECT id FROM bills WHERE id = 'bill-oversell'");
    expect(b.rows.length).toBe(0);
  });
});
