/**
 * Changing a saved purchase (C-028), and the selling price set on one (0022),
 * against an isolated file DB.
 *
 * The edit rules exist to stop the shelf saying something untrue, so the
 * refusals matter as much as the successes — and a refusal has to leave the
 * database exactly as it was, which is checked after every one of them.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// A unique file per run: on Windows a previous run's client can still hold
// the old file, and reusing the name is what made other suites flaky.
const DB_FILE = join(__dirname, `purchase-edit.${process.pid}-${Date.now()}.db`);

process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = "";

const USER = "u1";
const DATE_BS = "2083-06-10";
const DATE_AD = "2026-09-26";
const EXPIRY = "2028-01-31";

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

  const raw = createClient({ url: `file:${DB_FILE}` });
  const migDir = join(__dirname, "..", "db", "migrations");
  for (const f of readdirSync(migDir).filter((n) => n.endsWith(".sql")).sort()) {
    for (const stmt of splitStatements(readFileSync(join(migDir, f), "utf8"))) {
      await raw.execute(stmt);
    }
  }
  await raw.execute(
    `INSERT INTO users (id, name, username, password_hash, role, created_at)
     VALUES ('u1','Admin','admin','x','admin','t')`,
  );
  await raw.execute(
    `INSERT INTO fiscal_years (bs_label, start_ad, end_ad, active, status)
     VALUES ('2083/84','2026-07-17','2027-07-16',1,'open')`,
  );
  await raw.execute(
    `INSERT INTO suppliers (id, name, created_at) VALUES
       ('s1','Pharmachoice Traders','t'), ('s2','Other Distributor','t')`,
  );
  // Two medicines, each Tablet (base) -> Strip of 10.
  const medicines: [string, string][] = [
    ["cet", "Cetamol 500"],
    ["amx", "Amoxil 500"],
  ];
  for (const [id, name] of medicines) {
    await raw.execute({
      sql: `INSERT INTO items (id, brand_name, generic_name, category, created_at, updated_at)
            VALUES (?, ?, '', 'Medicine', 't', 't')`,
      args: [id, name],
    });
    await raw.execute({
      sql: `INSERT INTO item_units (id, item_id, level, name, factor_to_base, selling_rate_paisa, is_default_selling)
            VALUES (?, ?, 0, 'Tablet', 1, 0, 0), (?, ?, 1, 'Strip', 10, 2500, 1)`,
      args: [`${id}-u0`, id, `${id}-u1`, id],
    });
  }
  raw.close();
});

async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []): Promise<T[]> {
  const { db } = await import("@/lib/db");
  const r = await db().execute({ sql, args: args as never });
  return r.rows as unknown as T[];
}

function line(over: Partial<Record<string, unknown>> = {}) {
  return {
    itemId: "cet",
    batchNo: "C-1",
    mfgDateAd: null,
    expiryDateAd: EXPIRY,
    unitLevel: 1, // Strip
    factorToBase: 10,
    qty: 10, // 10 strips = 100 tablets
    freeQty: 0,
    unitCostPaisa: 2000,
    discountPaisa: 0,
    ...over,
  } as import("@/lib/repos/purchases").PurchaseUpdateLineInput;
}

/** Everything an edit could touch, so a refusal can be shown to touch nothing. */
async function snapshot(purchaseId: string) {
  return JSON.stringify({
    p: await q("SELECT * FROM purchases WHERE id = ?", [purchaseId]),
    pl: await q("SELECT * FROM purchase_lines WHERE purchase_id = ? ORDER BY id", [purchaseId]),
    b: await q("SELECT * FROM batches WHERE purchase_id = ? ORDER BY id", [purchaseId]),
    sm: await q("SELECT * FROM stock_moves ORDER BY id"),
    iu: await q("SELECT * FROM item_units ORDER BY id"),
    audit: await q("SELECT id FROM audit_log ORDER BY id"),
  });
}

/** A sale out of a batch, the way the counter records one. */
async function sell(batchId: string, itemId: string, baseQty: number) {
  const { applyStockMove } = await import("@/lib/repos/batches");
  await applyStockMove({
    batchId,
    itemId,
    baseQtyDelta: -baseQty,
    reason: "sale",
    refTable: "bills",
    refId: "bill-x",
    userId: USER,
  });
}

async function newPurchase(lines = [line()]) {
  const { createPurchase } = await import("@/lib/repos/purchases");
  return createPurchase({
    supplierId: "s1",
    supplierInvoiceNo: "SB-1",
    dateAd: DATE_AD,
    dateBs: DATE_BS,
    vatPaisa: 0,
    lines,
    userId: USER,
  });
}

async function linesOf(purchaseId: string) {
  const { getPurchase } = await import("@/lib/repos/purchases");
  const p = await getPurchase(purchaseId);
  return p!;
}

function baseEdit(purchaseId: string) {
  return {
    purchaseId,
    supplierId: "s1",
    supplierInvoiceNo: "SB-1",
    dateAd: DATE_AD,
    dateBs: DATE_BS,
    vatPaisa: 0,
    billDiscountPaisa: 0,
    roundingPaisa: 0,
    userId: USER,
  };
}

describe("selling price set on a purchase (0022)", () => {
  it("updates the item's price for that unit and keeps a copy on the line", async () => {
    const { id } = await newPurchase([line({ sellingRatePaisa: 3000 })]);
    const [strip] = await q<{ selling_rate_paisa: number }>(
      "SELECT selling_rate_paisa FROM item_units WHERE item_id = 'cet' AND level = 1",
    );
    expect(Number(strip!.selling_rate_paisa)).toBe(3000);
    const p = await linesOf(id);
    expect(p.lines[0]!.sellingRatePaisa).toBe(3000);
  });

  it("touches only the unit on the line — a strip price does not price a tablet", async () => {
    const [tab] = await q<{ selling_rate_paisa: number }>(
      "SELECT selling_rate_paisa FROM item_units WHERE item_id = 'cet' AND level = 0",
    );
    expect(Number(tab!.selling_rate_paisa)).toBe(0);
  });

  it("leaves the price alone when none is given, as every older caller does", async () => {
    await newPurchase([line({ itemId: "amx", batchNo: "A-0" })]); // no sellingRatePaisa
    const [strip] = await q<{ selling_rate_paisa: number }>(
      "SELECT selling_rate_paisa FROM item_units WHERE item_id = 'amx' AND level = 1",
    );
    expect(Number(strip!.selling_rate_paisa)).toBe(2500);
  });

  it("bumps the item's updated_at only when the price really changes", async () => {
    await q("UPDATE items SET updated_at = 'before' WHERE id = 'cet'");
    await newPurchase([line({ batchNo: "C-same", sellingRatePaisa: 3000 })]); // same price
    const [same] = await q<{ updated_at: string }>("SELECT updated_at FROM items WHERE id = 'cet'");
    expect(same!.updated_at).toBe("before");

    await newPurchase([line({ batchNo: "C-new", sellingRatePaisa: 3200 })]);
    const [moved] = await q<{ updated_at: string }>("SELECT updated_at FROM items WHERE id = 'cet'");
    expect(moved!.updated_at).not.toBe("before");
  });
});

describe("editing a saved purchase", () => {
  it("raises a quantity: the batch grows and an adjustment is appended", async () => {
    const { updatePurchase } = await import("@/lib/repos/purchases");
    const { id } = await newPurchase([line({ batchNo: "E-1" })]);
    const before = await linesOf(id);
    const l = before.lines[0]!;

    await updatePurchase({
      ...baseEdit(id),
      lines: [line({ lineId: l.lineId, batchNo: "E-1", qty: 12 })],
    });

    const [b] = await q<{ received_base_qty: number; remaining_base_qty: number }>(
      "SELECT received_base_qty, remaining_base_qty FROM batches WHERE id = ?",
      [l.batchId],
    );
    expect(Number(b!.received_base_qty)).toBe(120);
    expect(Number(b!.remaining_base_qty)).toBe(120);

    const moves = await q<{ reason: string; base_qty_delta: number; ref_table: string; ref_id: string }>(
      "SELECT reason, base_qty_delta, ref_table, ref_id FROM stock_moves WHERE batch_id = ? ORDER BY at, id",
      [l.batchId],
    );
    // the original arrival is untouched; the correction is added after it
    expect(moves.map((m) => [m.reason, Number(m.base_qty_delta)])).toEqual([
      ["purchase", 100],
      ["adjustment", 20],
    ]);
    expect(moves[1]!.ref_table).toBe("purchases");
    expect(moves[1]!.ref_id).toBe(id);

    const [p] = await q<{ subtotal_paisa: number; total_paisa: number }>(
      "SELECT subtotal_paisa, total_paisa FROM purchases WHERE id = ?",
      [id],
    );
    expect(Number(p!.subtotal_paisa)).toBe(12 * 2000);
    expect(Number(p!.total_paisa)).toBe(12 * 2000);
  });

  it("lowers a quantity down to, but not below, what has already been sold", async () => {
    const { updatePurchase, PurchaseEditError } = await import("@/lib/repos/purchases");
    const { id } = await newPurchase([line({ batchNo: "E-2" })]); // 100 tablets
    const l = (await linesOf(id)).lines[0]!;
    await sell(l.batchId, "cet", 40); // 60 left on the shelf

    // below what was sold: refused, and nothing at all changes
    const snap = await snapshot(id);
    await expect(
      updatePurchase({
        ...baseEdit(id),
        lines: [line({ lineId: l.lineId, batchNo: "E-2", qty: 3 })], // 30 < 40 sold
      }),
    ).rejects.toBeInstanceOf(PurchaseEditError);
    expect(await snapshot(id)).toBe(snap);

    // exactly what was sold: allowed, and the shelf is empty
    await updatePurchase({
      ...baseEdit(id),
      lines: [line({ lineId: l.lineId, batchNo: "E-2", qty: 4 })],
    });
    const [b] = await q<{ received_base_qty: number; remaining_base_qty: number }>(
      "SELECT received_base_qty, remaining_base_qty FROM batches WHERE id = ?",
      [l.batchId],
    );
    expect(Number(b!.received_base_qty)).toBe(40);
    expect(Number(b!.remaining_base_qty)).toBe(0);
  });

  it("refuses to swap the item or remove a line once its batch has moved", async () => {
    const { updatePurchase, PurchaseEditError } = await import("@/lib/repos/purchases");
    const { id } = await newPurchase([
      line({ batchNo: "E-3a" }),
      line({ itemId: "amx", batchNo: "E-3b" }),
    ]);
    const [a, b] = (await linesOf(id)).lines;
    await sell(a!.batchId, "cet", 5);
    const snap = await snapshot(id);

    // swap the sold line's item
    await expect(
      updatePurchase({
        ...baseEdit(id),
        lines: [
          line({ lineId: a!.lineId, itemId: "amx", batchNo: "E-3a" }),
          line({ lineId: b!.lineId, itemId: "amx", batchNo: "E-3b" }),
        ],
      }),
    ).rejects.toBeInstanceOf(PurchaseEditError);
    expect(await snapshot(id)).toBe(snap);

    // drop the sold line
    await expect(
      updatePurchase({
        ...baseEdit(id),
        lines: [line({ lineId: b!.lineId, itemId: "amx", batchNo: "E-3b" })],
      }),
    ).rejects.toBeInstanceOf(PurchaseEditError);
    expect(await snapshot(id)).toBe(snap);
  });

  it("removes an untouched line: its batch is emptied into the ledger and kept", async () => {
    const { updatePurchase } = await import("@/lib/repos/purchases");
    const { id } = await newPurchase([
      line({ batchNo: "E-4a" }),
      line({ itemId: "amx", batchNo: "E-4b", qty: 5 }),
    ]);
    const [keep, drop] = (await linesOf(id)).lines;

    await updatePurchase({
      ...baseEdit(id),
      lines: [line({ lineId: keep!.lineId, batchNo: "E-4a" })],
    });

    const after = await linesOf(id);
    expect(after.lines.map((l) => l.lineId)).toEqual([keep!.lineId]);

    const [batch] = await q<{ received_base_qty: number; remaining_base_qty: number }>(
      "SELECT received_base_qty, remaining_base_qty FROM batches WHERE id = ?",
      [drop!.batchId],
    );
    expect(batch).toBeDefined(); // kept, not deleted
    expect(Number(batch!.remaining_base_qty)).toBe(0);
    expect(Number(batch!.received_base_qty)).toBe(0);
    const moves = await q<{ base_qty_delta: number }>(
      "SELECT base_qty_delta FROM stock_moves WHERE batch_id = ? ORDER BY at, id",
      [drop!.batchId],
    );
    expect(moves.map((m) => Number(m.base_qty_delta))).toEqual([50, -50]);
    // and the bill only counts what is left on it
    expect(after.subtotalPaisa).toBe(10 * 2000);
  });

  it("swaps the item on an untouched line, and adds a new line", async () => {
    const { updatePurchase } = await import("@/lib/repos/purchases");
    const { id } = await newPurchase([line({ batchNo: "E-5" })]);
    const l = (await linesOf(id)).lines[0]!;

    await updatePurchase({
      ...baseEdit(id),
      lines: [
        line({ lineId: l.lineId, itemId: "amx", batchNo: "E-5" }),
        line({ batchNo: "E-5-new", qty: 2 }),
      ],
    });
    const after = await linesOf(id);
    expect(after.lines.map((x) => [x.itemId, x.batchNo, x.qty])).toEqual([
      ["amx", "E-5", 10],
      ["cet", "E-5-new", 2],
    ]);
    // the old cetamol batch no longer holds stock
    const [old] = await q<{ remaining_base_qty: number }>(
      "SELECT remaining_base_qty FROM batches WHERE id = ?",
      [l.batchId],
    );
    expect(Number(old!.remaining_base_qty)).toBe(0);
  });

  it("keeps the date inside the purchase's fiscal year", async () => {
    const { updatePurchase, PurchaseEditError } = await import("@/lib/repos/purchases");
    const { id } = await newPurchase([line({ batchNo: "E-6" })]);
    const l = (await linesOf(id)).lines[0]!;
    const snap = await snapshot(id);
    await expect(
      updatePurchase({
        ...baseEdit(id),
        dateBs: "2082-12-01", // fiscal year 2082/83
        dateAd: "2026-03-14",
        lines: [line({ lineId: l.lineId, batchNo: "E-6" })],
      }),
    ).rejects.toBeInstanceOf(PurchaseEditError);
    expect(await snapshot(id)).toBe(snap);
  });

  it("moves the purchase — and its batches — to another supplier", async () => {
    const { updatePurchase } = await import("@/lib/repos/purchases");
    const { id } = await newPurchase([line({ batchNo: "E-7" })]);
    const l = (await linesOf(id)).lines[0]!;
    await updatePurchase({
      ...baseEdit(id),
      supplierId: "s2",
      lines: [line({ lineId: l.lineId, batchNo: "E-7" })],
    });
    const [p] = await q<{ supplier_id: string }>("SELECT supplier_id FROM purchases WHERE id = ?", [id]);
    const [b] = await q<{ supplier_id: string }>("SELECT supplier_id FROM batches WHERE id = ?", [l.batchId]);
    expect(p!.supplier_id).toBe("s2");
    expect(b!.supplier_id).toBe("s2");
  });

  it("re-saving does not put an old recorded price back onto the item", async () => {
    const { updatePurchase } = await import("@/lib/repos/purchases");
    const { setUnitRates } = await import("@/lib/repos/items");
    const { id } = await newPurchase([line({ itemId: "amx", batchNo: "E-8", sellingRatePaisa: 4000 })]);
    const l = (await linesOf(id)).lines[0]!;

    // the price moves on elsewhere, in Items -> Set prices
    await setUnitRates("amx", [{ level: 1, sellingRatePaisa: 4500 }]);

    // an unrelated fix to the purchase, sending the recorded 40 unchanged
    await updatePurchase({
      ...baseEdit(id),
      supplierInvoiceNo: "SB-1-corrected",
      lines: [line({ lineId: l.lineId, itemId: "amx", batchNo: "E-8", sellingRatePaisa: 4000 })],
    });
    const [strip] = await q<{ selling_rate_paisa: number }>(
      "SELECT selling_rate_paisa FROM item_units WHERE item_id = 'amx' AND level = 1",
    );
    expect(Number(strip!.selling_rate_paisa)).toBe(4500);

    // but a price actually changed in the edit does reach the item
    await updatePurchase({
      ...baseEdit(id),
      lines: [line({ lineId: l.lineId, itemId: "amx", batchNo: "E-8", sellingRatePaisa: 4800 })],
    });
    const [after] = await q<{ selling_rate_paisa: number }>(
      "SELECT selling_rate_paisa FROM item_units WHERE item_id = 'amx' AND level = 1",
    );
    expect(Number(after!.selling_rate_paisa)).toBe(4800);
  });

  it("records every edit in the audit log, with before and after", async () => {
    const { updatePurchase } = await import("@/lib/repos/purchases");
    const { id } = await newPurchase([line({ batchNo: "E-9" })]);
    const l = (await linesOf(id)).lines[0]!;
    await updatePurchase({
      ...baseEdit(id),
      lines: [line({ lineId: l.lineId, batchNo: "E-9", unitCostPaisa: 1800 })],
    });
    const rows = await q<{ user_id: string; detail_json: string }>(
      "SELECT user_id, detail_json FROM audit_log WHERE action = 'purchase_edit' AND detail_json LIKE ?",
      [`%"purchaseId":"${id}"%`],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe(USER);
    const detail = JSON.parse(rows[0]!.detail_json);
    expect(detail.before.lines[0].costPaisa).toBe(2000);
    expect(detail.after.lines[0].costPaisa).toBe(1800);
    // and the purchase says it was changed
    expect((await linesOf(id)).lastEdit?.byName).toBe("Admin");
  });

  it("refuses a line id that belongs to another purchase", async () => {
    const { updatePurchase, PurchaseEditError } = await import("@/lib/repos/purchases");
    const one = await newPurchase([line({ batchNo: "E-10a" })]);
    const two = await newPurchase([line({ batchNo: "E-10b" })]);
    const foreign = (await linesOf(two.id)).lines[0]!;
    const snap = await snapshot(one.id);
    await expect(
      updatePurchase({
        ...baseEdit(one.id),
        lines: [line({ lineId: foreign.lineId, batchNo: "E-10b" })],
      }),
    ).rejects.toBeInstanceOf(PurchaseEditError);
    expect(await snapshot(one.id)).toBe(snap);
  });
});
