/**
 * Phase 3 acceptance (server side): idempotent bill ingest, authoritative FEFO
 * with multi-batch spill, and per-fiscal-year invoice numbering.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// A unique file per run: on Windows a previous run's client can still hold
// the old file, and reusing the name is what made this suite flaky.
const DB_FILE = join(__dirname, `phase3-verify.${process.pid}-${Date.now()}.db`);

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

function isoInDays(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    for (const stmt of splitStatements(readFileSync(join(migDir, f), "utf8"))) {
      await raw.execute(stmt);
    }
  }
  await raw.execute({
    sql: `INSERT INTO users (id, name, username, password_hash, role, created_at)
          VALUES ('u1', 'Bikash', 'bikash', 'x', 'staff', ?)`,
    args: [new Date().toISOString()],
  });
  raw.close();

  const { createItem } = await import("@/lib/repos/items");
  const { createBatchWithStock } = await import("@/lib/repos/batches");
  itemId = await createItem({
    brandName: "ABC Med",
    genericName: "Amoxicillin 500",
    category: "Medicine",
    manufacturer: "Citizen Pharma",
    minStockBaseQty: 0,
    controlledFlag: false,
    shape: "tablet",
    preferredSupplierId: null,
    active: true,
    units: [
      { level: 0, name: "Tablet", factorToBase: 1, sellingRatePaisa: 200, isDefaultSelling: false },
      { level: 1, name: "Strip", factorToBase: 10, sellingRatePaisa: 1800, isDefaultSelling: true },
    ],
  });
  // near-expiry batch (30 base) + far batch (100 base)
  await createBatchWithStock({
    itemId, batchNo: "B-NEAR", mfgDateAd: null, expiryDateAd: isoInDays(30),
    costPaisaPerBase: 150, baseQty: 30, supplierId: null, purchaseId: null, userId: "u1", reason: "purchase",
  });
  await createBatchWithStock({
    itemId, batchNo: "B-FAR", mfgDateAd: null, expiryDateAd: isoInDays(300),
    costPaisaPerBase: 150, baseQty: 100, supplierId: null, purchaseId: null, userId: "u1", reason: "purchase",
  });
});

function billInput(id: string) {
  return {
    id,
    dateBs: "2083-04-05",
    dateAd: TODAY,
    patientName: "",
    paymentMethod: "cash" as const,
    tenderedPaisa: 10000,
    billDiscountPaisa: 0,
    userId: "u1",
    clientCreatedAt: new Date().toISOString(),
    lines: [
      {
        id: `${id}-line-1`,
        itemId,
        unitLevel: 1, // 4 strips = 40 base
        qty: 4,
        ratePaisa: 1800,
        rateOverridden: false,
        discountPaisa: 0,
      },
    ],
  };
}

describe("Phase 3 — bill ingest", () => {
  it("assigns invoice #1 and spills across two batches (FEFO)", async () => {
    const { ingestBill } = await import("@/lib/repos/bills");
    const { db } = await import("@/lib/db");
    const res = await ingestBill(billInput("bill-A"));

    expect(res.invoiceNo).toBe(1);
    expect(res.fiscalLabel).toBe("2083/84");
    expect(res.alreadyExisted).toBe(false);

    // 40 base = 30 from B-NEAR + 10 from B-FAR
    const allocs = await db().execute({
      args: [],
      sql: `SELECT bb.base_qty, ba.batch_no FROM bill_line_batches bb
            JOIN batches ba ON ba.id = bb.batch_id
            JOIN bill_lines bl ON bl.id = bb.bill_line_id
            WHERE bl.bill_id = 'bill-A' ORDER BY ba.expiry_date_ad`,
    });
    const map = Object.fromEntries(
      allocs.rows.map((r) => [r.batch_no as string, Number(r.base_qty)]),
    );
    expect(map).toEqual({ "B-NEAR": 30, "B-FAR": 10 });

    // stock decremented: near 0, far 90
    const b = await db().execute(
      "SELECT batch_no, remaining_base_qty FROM batches WHERE item_id = '" + itemId + "'",
    );
    const rem = Object.fromEntries(
      b.rows.map((r) => [r.batch_no as string, Number(r.remaining_base_qty)]),
    );
    expect(rem["B-NEAR"]).toBe(0);
    expect(rem["B-FAR"]).toBe(90);
  });

  it("is idempotent — resubmitting the same ULID does not double-decrement", async () => {
    const { ingestBill } = await import("@/lib/repos/bills");
    const { db } = await import("@/lib/db");
    const res = await ingestBill(billInput("bill-A"));
    expect(res.alreadyExisted).toBe(true);
    expect(res.invoiceNo).toBe(1);

    const b = await db().execute(
      "SELECT remaining_base_qty FROM batches WHERE batch_no = 'B-FAR'",
    );
    expect(Number(b.rows[0]!.remaining_base_qty)).toBe(90); // unchanged
    const count = await db().execute("SELECT COUNT(*) AS n FROM bills");
    expect(Number(count.rows[0]!.n)).toBe(1);
  });

  it("the next distinct bill gets invoice #2", async () => {
    const { ingestBill } = await import("@/lib/repos/bills");
    const res = await ingestBill(billInput("bill-B"));
    expect(res.invoiceNo).toBe(2);
  });
});
