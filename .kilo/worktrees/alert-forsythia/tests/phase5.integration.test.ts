/**
 * Phase 5: backup export → restore round-trip returns data exactly to snapshot,
 * atomically.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// A unique file per run: on Windows a previous run's client can still hold
// the old file, and reusing the name is what made this suite flaky.
const DB_FILE = join(__dirname, `phase5-verify.${process.pid}-${Date.now()}.db`);

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
    brandName: "ABC Med", genericName: "Amox", category: "Medicine", manufacturer: "X",
    minStockBaseQty: 10, controlledFlag: false, preferredSupplierId: null, active: true, shape: "capsule",
    units: [{ level: 0, name: "Tablet", factorToBase: 1, sellingRatePaisa: 200, isDefaultSelling: true }],
  });
  await createBatchWithStock({
    itemId, batchNo: "A", mfgDateAd: null, expiryDateAd: isoInDays(200),
    costPaisaPerBase: 100, baseQty: 50, supplierId: null, purchaseId: null, userId: "u1", reason: "purchase",
  });
});

describe("Phase 5 — backup / restore", () => {
  it("exports all tables", async () => {
    const { exportAll } = await import("@/lib/repos/backup");
    const archive = await exportAll();
    // Version 2 since the clinic tables and the file manifest were added;
    // a version 1 archive still restores.
    expect(archive.version).toBe(2);
    expect(archive.tables.items!.length).toBe(1);
    expect(archive.tables.batches!.length).toBe(1);
    expect(archive.tables.users!.length).toBe(1);
  });

  it("restores a snapshot exactly (round-trip)", async () => {
    const { exportAll, restoreAll } = await import("@/lib/repos/backup");
    const { db } = await import("@/lib/db");
    const snapshot = await exportAll();

    // mutate: add a bill via direct insert of a second item, then restore
    const { createItem } = await import("@/lib/repos/items");
    await createItem({
      brandName: "Extra Med", genericName: "", category: "Other", manufacturer: "",
      minStockBaseQty: 0, controlledFlag: false, preferredSupplierId: null, active: true, shape: "tablet",
      units: [{ level: 0, name: "Piece", factorToBase: 1, sellingRatePaisa: 50, isDefaultSelling: true }],
    });
    let count = await db().execute("SELECT COUNT(*) n FROM items");
    expect(Number(count.rows[0]!.n)).toBe(2);

    await restoreAll(snapshot);
    count = await db().execute("SELECT COUNT(*) n FROM items");
    expect(Number(count.rows[0]!.n)).toBe(1); // back to snapshot
    const item = await db().execute("SELECT brand_name FROM items");
    expect(item.rows[0]!.brand_name).toBe("ABC Med");
  });
});
