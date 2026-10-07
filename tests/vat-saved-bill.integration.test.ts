/**
 * VAT on a bill the server actually saves (0024).
 *
 * The counter only previews; `ingestBill` works the figures out again and is
 * what is kept. This proves the saved bill follows the setting, records which
 * mode it was made under and what the VAT was charged on — and that changing
 * the setting afterwards does not change how an old bill reads.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `vat-saved.${process.pid}-${Date.now()}.db`);
process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = "";

const MIG_DIR = join(__dirname, "..", "db", "migrations");

function split(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

let TODAY_AD = "";
let TODAY_BS = "";
let itemId = "";

async function q(sql: string, args: unknown[] = []) {
  const { db } = await import("@/lib/db");
  return (await db().execute({ sql, args: args as never })).rows;
}

async function setVat(vatInclusive: boolean) {
  const { getCompany, saveCompany } = await import("@/lib/repos/company");
  const c = await getCompany();
  await saveCompany({ ...c, name: "Family Smile Dental Care Center", vatRegistered: true, vatInclusive });
}

/** Ten tablets at Rs 1,000 each: a Rs 10,000 line, and medicines are VAT-able. */
async function sellTenThousand(id: string) {
  const { ingestBill } = await import("@/lib/repos/bills");
  return ingestBill({
    id,
    dateBs: TODAY_BS,
    dateAd: TODAY_AD,
    patientName: "",
    patientId: null,
    paymentMethod: "cash",
    tenderedPaisa: 0,
    billDiscountPaisa: 0,
    userId: "u1",
    clientCreatedAt: new Date().toISOString(),
    lines: [
      {
        id: `${id}-L1`,
        itemId,
        unitLevel: 0,
        qty: 10,
        ratePaisa: 100_000,
        rateOverridden: false,
        discountPaisa: 0,
      },
    ],
  });
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
  for (const f of readdirSync(MIG_DIR).filter((n) => n.endsWith(".sql")).sort()) {
    for (const stmt of split(readFileSync(join(MIG_DIR, f), "utf8"))) {
      await raw.execute(stmt);
    }
  }
  await raw.execute({
    sql: `INSERT INTO users (id, name, username, password_hash, role, created_at)
          VALUES ('u1','Admin','admin','x','admin',?)`,
    args: [new Date().toISOString()],
  });
  raw.close();

  const { today, toAD, adToIso, bsToDbText } = await import("@/lib/bs");
  const t = today();
  TODAY_BS = bsToDbText(t);
  TODAY_AD = adToIso(toAD(t));

  const { createItem } = await import("@/lib/repos/items");
  const { createBatchWithStock } = await import("@/lib/repos/batches");
  itemId = await createItem({
    brandName: "VAT Tab", genericName: "", category: "Medicine", manufacturer: "",
    minStockBaseQty: 0, controlledFlag: false, preferredSupplierId: null, active: true, shape: "tablet",
    units: [{ level: 0, name: "Tablet", factorToBase: 1, sellingRatePaisa: 100_000, isDefaultSelling: true }],
  });
  await createBatchWithStock({
    itemId, batchNo: "V1", mfgDateAd: null,
    expiryDateAd: adToIso(new Date(Date.now() + 400 * 86400000)),
    costPaisaPerBase: 50_000, baseQty: 100, supplierId: null, purchaseId: null, userId: "u1", reason: "purchase",
  });
});

describe("a saved bill follows the VAT setting", () => {
  it("with VAT included, Rs 10,000 is what is paid and Rs 1,150.44 of it is VAT", async () => {
    await setVat(true);
    await sellTenThousand("B-INC");
    const [b] = await q(
      "SELECT total_paisa, vat_paisa, taxable_paisa, vat_inclusive FROM bills WHERE id = 'B-INC'",
    );
    expect(Number(b!.total_paisa)).toBe(1_000_000);
    expect(Number(b!.vat_paisa)).toBe(115_044);
    expect(Number(b!.taxable_paisa)).toBe(884_956);
    expect(Number(b!.vat_inclusive)).toBe(1);
  });

  it("with VAT on top, Rs 10,000 becomes Rs 11,300", async () => {
    await setVat(false);
    await sellTenThousand("B-TOP");
    const [b] = await q(
      "SELECT total_paisa, vat_paisa, taxable_paisa, vat_inclusive FROM bills WHERE id = 'B-TOP'",
    );
    expect(Number(b!.total_paisa)).toBe(1_130_000);
    expect(Number(b!.vat_paisa)).toBe(130_000);
    expect(Number(b!.taxable_paisa)).toBe(1_000_000);
    expect(Number(b!.vat_inclusive)).toBe(0);
  });

  it("changing the setting later does not change how the first bill reads", async () => {
    const { getBillDetail } = await import("@/lib/repos/bills");
    const first = await getBillDetail("B-INC");
    expect(first!.vatInclusive).toBe(true);
    expect(first!.taxablePaisa).toBe(884_956);
    expect(first!.totalPaisa).toBe(1_000_000);
  });

  it("the VAT report adds up each bill's own taxable amount", async () => {
    const { vatSummary } = await import("@/lib/repos/reports");
    const v = await vatSummary(TODAY_AD, TODAY_AD);
    expect(v.salesTaxablePaisa).toBe(884_956 + 1_000_000);
    expect(v.salesVatPaisa).toBe(115_044 + 130_000);
  });
});
