/**
 * Phase 1 — stock out with reasons (PRD §4A.2), against an isolated file DB.
 * Covers the acceptance boxes: a supplier return credits the ledger, only a
 * count correction can move stock up, and the register totals by reason.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// A unique file per run: on Windows a previous run's client can still hold
// the old file, and reusing the name is what made this suite flaky.
const DB_FILE = join(__dirname, `stock-out-verify.${process.pid}-${Date.now()}.db`);

process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = "";

const TODAY = "2026-08-29";
const TODAY_BS = "2083-05-13";

function splitStatements(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

let itemId: string;
let batchA: string;
let batchB: string;

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

  const raw = createClient({ url: `file:${DB_FILE}` });
  const migDir = join(__dirname, "..", "db", "migrations");
  for (const f of readdirSync(migDir).filter((n) => n.endsWith(".sql")).sort()) {
    for (const stmt of splitStatements(readFileSync(join(migDir, f), "utf8"))) {
      await raw.execute(stmt);
    }
  }
  await raw.execute(
    `INSERT INTO users (id, name, username, password_hash, role, created_at)
     VALUES ('u1','Sarita','admin','x','admin','t')`,
  );
  await raw.execute(
    `INSERT INTO fiscal_years (bs_label, start_ad, end_ad, active, status)
     VALUES ('2083/84','2026-07-17','2027-07-16',1,'open')`,
  );
  await raw.execute(
    `INSERT INTO suppliers (id, name, created_at) VALUES ('s1','Sample Distributors','t')`,
  );
  raw.close();

  const { createItem } = await import("@/lib/repos/items");
  const { createBatchWithStock } = await import("@/lib/repos/batches");
  itemId = await createItem({
    brandName: "Citizen Pharma Sample Amoxicillin 500",
    genericName: "Amoxicillin",
    category: "Medicine",
    manufacturer: "",
    minStockBaseQty: 0,
    controlledFlag: false,
    preferredSupplierId: null,
    active: true,
    shape: "capsule",
    units: [
      { level: 0, name: "Capsule", factorToBase: 1, sellingRatePaisa: 300, isDefaultSelling: true },
      { level: 1, name: "Strip", factorToBase: 10, sellingRatePaisa: 2800, isDefaultSelling: false },
    ],
  });
  // batch A costs 100 paisa/base, batch B costs 200
  batchA = await createBatchWithStock({
    itemId, batchNo: "A-1", mfgDateAd: null, expiryDateAd: "2027-06-01",
    costPaisaPerBase: 100, baseQty: 100, supplierId: "s1", purchaseId: null, userId: "u1",
    reason: "purchase",
  });
  batchB = await createBatchWithStock({
    itemId, batchNo: "B-2", mfgDateAd: null, expiryDateAd: "2028-01-01",
    costPaisaPerBase: 200, baseQty: 50, supplierId: "s1", purchaseId: null, userId: "u1",
    reason: "purchase",
  });
});

async function remaining(batchId: string): Promise<number> {
  const { db } = await import("@/lib/db");
  const r = await db().execute({
    sql: "SELECT remaining_base_qty q FROM batches WHERE id = ?",
    args: [batchId],
  });
  return Number(r.rows[0]!.q);
}

describe("Stock out — returned to supplier", () => {
  it("takes stock down, credits the supplier, and records a purchase return", async () => {
    const { createStockOut } = await import("@/lib/repos/adjustments");
    const { db } = await import("@/lib/db");

    const before = await remaining(batchA);
    // 1 strip = 10 capsules
    const res = await createStockOut({
      direction: "out",
      reason: "returned_to_supplier",
      dateAd: TODAY,
      dateBs: TODAY_BS,
      supplierId: "s1",
      lines: [
        { itemId, batchId: batchA, baseQty: 10, unitLevelEntered: 1, qtyEntered: 1 },
      ],
      userId: "u1",
    });

    expect(await remaining(batchA)).toBe(before - 10);
    // 10 base at 100 paisa = 1000 paisa
    expect(res.totalCostPaisa).toBe(1000);
    expect(res.purchaseReturnId).not.toBeNull();
    expect(res.adjustmentNo).toBe(1);

    // a real purchase return exists, so the supplier ledger has one source
    const pr = await db().execute({
      sql: "SELECT supplier_id, total_paisa FROM purchase_returns WHERE id = ?",
      args: [res.purchaseReturnId!],
    });
    expect(pr.rows[0]!.supplier_id).toBe("s1");
    expect(Number(pr.rows[0]!.total_paisa)).toBe(1000);

    const prl = await db().execute({
      sql: "SELECT COUNT(*) n FROM purchase_return_lines WHERE purchase_return_id = ?",
      args: [res.purchaseReturnId!],
    });
    expect(Number(prl.rows[0]!.n)).toBe(1);

    // the ledger move carries the reason, not a generic write-off
    const move = await db().execute({
      sql: "SELECT reason, base_qty_delta FROM stock_moves WHERE ref_id = ?",
      args: [res.id],
    });
    expect(move.rows[0]!.reason).toBe("returned_to_supplier");
    expect(Number(move.rows[0]!.base_qty_delta)).toBe(-10);
  });

  it("refuses without a supplier, in plain language", async () => {
    const { createStockOut, InvalidAdjustmentError } = await import(
      "@/lib/repos/adjustments"
    );
    await expect(
      createStockOut({
        direction: "out",
        reason: "returned_to_supplier",
        dateAd: TODAY,
        dateBs: TODAY_BS,
        lines: [{ itemId, batchId: batchA, baseQty: 1, unitLevelEntered: 0, qtyEntered: 1 }],
        userId: "u1",
      }),
    ).rejects.toBeInstanceOf(InvalidAdjustmentError);
  });
});

describe("Stock out — direction rules", () => {
  it("count correction is the only reason that can move stock UP", async () => {
    const { createStockOut, InvalidAdjustmentError, STOCK_OUT_REASONS } =
      await import("@/lib/repos/adjustments");

    // exactly one reason allows an increase
    expect(STOCK_OUT_REASONS.filter((r) => r.allowsIn).map((r) => r.key)).toEqual([
      "count_correction",
    ]);

    for (const reason of ["damaged", "lost", "sample", "disposed"] as const) {
      await expect(
        createStockOut({
          direction: "in",
          reason,
          dateAd: TODAY,
          dateBs: TODAY_BS,
          lines: [{ itemId, batchId: batchB, baseQty: 1, unitLevelEntered: 0, qtyEntered: 1 }],
          userId: "u1",
        }),
      ).rejects.toBeInstanceOf(InvalidAdjustmentError);
    }

    const before = await remaining(batchB);
    await createStockOut({
      direction: "in",
      reason: "count_correction",
      dateAd: TODAY,
      dateBs: TODAY_BS,
      note: "Recount after the shelf audit",
      lines: [{ itemId, batchId: batchB, baseQty: 5, unitLevelEntered: 0, qtyEntered: 5 }],
      userId: "u1",
    });
    expect(await remaining(batchB)).toBe(before + 5);
  });

  it("a count correction demands a note", async () => {
    const { createStockOut, InvalidAdjustmentError } = await import(
      "@/lib/repos/adjustments"
    );
    await expect(
      createStockOut({
        direction: "in",
        reason: "count_correction",
        dateAd: TODAY,
        dateBs: TODAY_BS,
        lines: [{ itemId, batchId: batchB, baseQty: 1, unitLevelEntered: 0, qtyEntered: 1 }],
        userId: "u1",
      }),
    ).rejects.toBeInstanceOf(InvalidAdjustmentError);
  });

  it("never takes out more than the batch holds, and writes nothing when it can't", async () => {
    const { createStockOut, AdjustmentShortError } = await import(
      "@/lib/repos/adjustments"
    );
    const { db } = await import("@/lib/db");

    const before = await remaining(batchA);
    const entriesBefore = await db().execute("SELECT COUNT(*) n FROM stock_adjustments");

    await expect(
      createStockOut({
        direction: "out",
        reason: "damaged",
        dateAd: TODAY,
        dateBs: TODAY_BS,
        lines: [
          { itemId, batchId: batchA, baseQty: 999999, unitLevelEntered: 0, qtyEntered: 999999 },
        ],
        userId: "u1",
      }),
    ).rejects.toBeInstanceOf(AdjustmentShortError);

    expect(await remaining(batchA)).toBe(before);
    const entriesAfter = await db().execute("SELECT COUNT(*) n FROM stock_adjustments");
    // the whole entry rolled back — no half-written header
    expect(Number(entriesAfter.rows[0]!.n)).toBe(Number(entriesBefore.rows[0]!.n));
  });
});

describe("Stock out — bulk entry and the register", () => {
  it("records many lines under one header and one number", async () => {
    const { createStockOut, getStockOut } = await import("@/lib/repos/adjustments");
    const res = await createStockOut({
      direction: "out",
      reason: "damaged",
      dateAd: TODAY,
      dateBs: TODAY_BS,
      note: "Carton crushed in transit",
      lines: [
        { itemId, batchId: batchA, baseQty: 3, unitLevelEntered: 0, qtyEntered: 3 },
        { itemId, batchId: batchB, baseQty: 2, unitLevelEntered: 0, qtyEntered: 2 },
      ],
      userId: "u1",
    });
    // 3 x 100 + 2 x 200 = 700
    expect(res.totalCostPaisa).toBe(700);

    const detail = await getStockOut(res.id);
    expect(detail!.lines).toHaveLength(2);
    expect(detail!.reason).toBe("damaged");
    expect(detail!.note).toBe("Carton crushed in transit");
    expect(detail!.userName).toBe("Sarita");
  });

  it("totals cost value per reason, matching a hand calculation", async () => {
    const { stockOutTotalsByReason, listStockOuts } = await import(
      "@/lib/repos/adjustments"
    );
    const totals = await stockOutTotalsByReason("2026-01-01", "2027-01-01");
    const byReason = Object.fromEntries(totals.map((t) => [t.reason, t]));

    // returned_to_supplier: 10 base x 100 = 1000
    expect(byReason.returned_to_supplier!.costPaisa).toBe(1000);
    expect(byReason.returned_to_supplier!.baseQty).toBe(10);
    // damaged: 3 x 100 + 2 x 200 = 700 across 5 base units
    expect(byReason.damaged!.costPaisa).toBe(700);
    expect(byReason.damaged!.baseQty).toBe(5);
    // count_correction: 5 base x 200 = 1000
    expect(byReason.count_correction!.costPaisa).toBe(1000);

    const all = await listStockOuts("2026-01-01", "2027-01-01");
    expect(all).toHaveLength(3);

    const onlyDamaged = await listStockOuts("2026-01-01", "2027-01-01", "damaged");
    expect(onlyDamaged).toHaveLength(1);
    expect(onlyDamaged[0]!.lineCount).toBe(2);
  });

  it("gives each entry its own number from the open year", async () => {
    const { listStockOuts } = await import("@/lib/repos/adjustments");
    const all = await listStockOuts("2026-01-01", "2027-01-01");
    const numbers = all.map((a) => a.adjustmentNo).sort((a, b) => a! - b!);
    expect(numbers).toEqual([1, 2, 3]);
  });
});

describe("Stock out — the reason list is fixed", () => {
  it("offers exactly the seven reasons the PRD names", async () => {
    const { STOCK_OUT_REASONS } = await import("@/lib/repos/adjustments");
    expect(STOCK_OUT_REASONS.map((r) => r.key)).toEqual([
      "returned_to_supplier",
      "disposed",
      "damaged",
      "lost",
      "clinic_use",
      "sample",
      "count_correction",
    ]);
  });

  it("marks 'used in the clinic' as the only clinic-gated reason", async () => {
    const { STOCK_OUT_REASONS } = await import("@/lib/repos/adjustments");
    expect(STOCK_OUT_REASONS.filter((r) => r.clinicOnly).map((r) => r.key)).toEqual([
      "clinic_use",
    ]);
  });

  it("explains the consequence of every reason in plain language", async () => {
    const { STOCK_OUT_REASONS } = await import("@/lib/repos/adjustments");
    // Word boundaries matter: "thrown away" is fine, "row" as a word is not.
    const banned = /\b(database|record|row|query|null|transaction|api|sync)\b/i;
    for (const r of STOCK_OUT_REASONS) {
      expect(r.consequence.length).toBeGreaterThan(10);
      expect(r.consequence).not.toMatch(banned);
      expect(r.label).not.toMatch(banned);
    }
  });
});
