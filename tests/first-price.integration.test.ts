/**
 * The first price a medicine is sold at becomes its price.
 *
 * 478 medicines arrived from a catalogue with no prices in it, and making
 * somebody stop and open Items the first time each one is asked for is how a
 * counter ends up not using the software. So the counter asks for a price and
 * keeps it.
 *
 * The whole feature rests on the word "once", so that is what these tests are
 * about: a rate typed on a later bill is that bill's business and must never
 * quietly rewrite the shop's price list. The guard lives in SQL rather than in
 * a read-then-write, which is also what makes two tills selling the same new
 * medicine in the same second safe — one of them wins and the other does not
 * silently overwrite it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ulid } from "ulid";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `first-price.${process.pid}-${Date.now()}.db`);

const TODAY_AD = "2026-09-08";
const TODAY_BS = "2083-05-23";

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

let unpricedId = "";
let pricedId = "";

/** Make an item with a Tablet/Strip pair, priced or not. */
async function makeItem(
  c: ReturnType<typeof createClient>,
  brand: string,
  tabletPaisa: number,
  stripPaisa: number,
): Promise<string> {
  const id = ulid();
  const now = new Date().toISOString();
  await c.execute({
    sql: `INSERT INTO items (id, brand_name, generic_name, category, manufacturer,
            min_stock_base_qty, controlled_flag, active, shape, created_at, updated_at)
          VALUES (?, ?, '', 'Medicine', '', 0, 0, 1, 'tablet', ?, ?)`,
    args: [id, brand, now, now],
  });
  await c.execute({
    sql: `INSERT INTO item_units (id, item_id, level, name, factor_to_base,
            selling_rate_paisa, is_default_selling)
          VALUES (?, ?, 0, 'Tablet', 1, ?, 0)`,
    args: [ulid(), id, tabletPaisa],
  });
  await c.execute({
    sql: `INSERT INTO item_units (id, item_id, level, name, factor_to_base,
            selling_rate_paisa, is_default_selling)
          VALUES (?, ?, 1, 'Strip', 10, ?, 1)`,
    args: [ulid(), id, stripPaisa],
  });
  const batchId = ulid();
  await c.execute({
    sql: `INSERT INTO batches (id, item_id, batch_no, expiry_date_ad,
            purchase_cost_paisa_per_base, received_base_qty, remaining_base_qty, created_at)
          VALUES (?, ?, 'B1', '2030-01-01', 100, 5000, 5000, ?)`,
    args: [batchId, id, now],
  });
  return id;
}

beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
  process.env.TURSO_AUTH_TOKEN = "";
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
  const now = new Date().toISOString();
  await c.execute({
    sql: `INSERT INTO users (id, name, username, password_hash, role, created_at)
          VALUES ('u1','Sarita','admin','x','admin',?)`,
    args: [now],
  });
  await c.execute(
    `INSERT INTO fiscal_years (bs_label, start_ad, end_ad, active, status)
     VALUES ('2083/84','2026-07-16','2027-07-15',1,'open')`,
  );

  unpricedId = await makeItem(c, "Never Sold Before", 0, 0);
  pricedId = await makeItem(c, "Already Priced", 200, 1800);
  c.close();
});

/** One medicine sale. */
async function sell(itemId: string, unitLevel: number, ratePaisa: number, qty = 1) {
  const { ingestBill } = await import("@/lib/repos/bills");
  return ingestBill({
    id: ulid(),
    dateBs: TODAY_BS,
    dateAd: TODAY_AD,
    patientName: "",
    paymentMethod: "cash",
    tenderedPaisa: 0,
    billDiscountPaisa: 0,
    lines: [
      {
        id: ulid(),
        itemId,
        unitLevel,
        qty,
        ratePaisa,
        rateOverridden: false,
        discountPaisa: 0,
      },
    ],
    serviceLines: [],
    userId: "u1",
    clientCreatedAt: new Date().toISOString(),
  });
}

async function rateOf(itemId: string, level: number): Promise<number> {
  const c = createClient({ url: `file:${DB_FILE}` });
  const r = await c.execute({
    sql: "SELECT selling_rate_paisa FROM item_units WHERE item_id = ? AND level = ?",
    args: [itemId, level],
  });
  c.close();
  return Number(r.rows[0]!.selling_rate_paisa);
}

describe("pricing a medicine by selling it", () => {
  it("keeps the price typed on the first bill", async () => {
    expect(await rateOf(unpricedId, 1)).toBe(0);
    const res = await sell(unpricedId, 1, 1800);
    expect(await rateOf(unpricedId, 1)).toBe(1800);
    expect(res.firstPriced).toEqual([
      { itemId: unpricedId, unitLevel: 1, ratePaisa: 1800 },
    ]);
  });

  it("does not let a later bill change it", async () => {
    // The whole point. A discount, a mistake or a haggle on the second sale
    // must not rewrite the shop's price list.
    const res = await sell(unpricedId, 1, 5000);
    expect(await rateOf(unpricedId, 1)).toBe(1800);
    expect(res.firstPriced).toEqual([]);
  });

  it("still bills the later sale at what was typed", async () => {
    // Refusing to move the master price is not the same as refusing the sale.
    const c = createClient({ url: `file:${DB_FILE}` });
    const rows = await c.execute(
      "SELECT rate_paisa FROM bill_lines ORDER BY rowid DESC LIMIT 1",
    );
    c.close();
    expect(Number(rows.rows[0]!.rate_paisa)).toBe(5000);
  });

  it("prices only the unit that was sold", async () => {
    // A strip at Rs 18 does not make a tablet Rs 1.80 — shops round loose
    // sales up — so the other units stay unpriced rather than being guessed.
    expect(await rateOf(unpricedId, 0)).toBe(0);
  });

  it("prices a second unit of the same medicine the first time that one sells", async () => {
    const res = await sell(unpricedId, 0, 250);
    expect(await rateOf(unpricedId, 0)).toBe(250);
    expect(res.firstPriced).toHaveLength(1);
    // and the strip it was already sold by is untouched
    expect(await rateOf(unpricedId, 1)).toBe(1800);
  });

  it("never touches a medicine that already had a price", async () => {
    const before = await rateOf(pricedId, 1);
    const res = await sell(pricedId, 1, 9900);
    expect(await rateOf(pricedId, 1)).toBe(before);
    expect(res.firstPriced).toEqual([]);
  });

  it("does not record a price of nothing", async () => {
    // A zero rate reaching here would set the price to zero for good. The
    // counter blocks it; this is the second line of defence.
    const fresh = await (async () => {
      const c = createClient({ url: `file:${DB_FILE}` });
      const id = await makeItem(c, "Zero Rate Attempt", 0, 0);
      c.close();
      return id;
    })();
    const res = await sell(fresh, 1, 0);
    expect(await rateOf(fresh, 1)).toBe(0);
    expect(res.firstPriced).toEqual([]);
  });

  it("bumps the item so every other till re-reads the catalogue", async () => {
    // catalogVersion() watches items.updated_at. Without the bump a second
    // counter keeps offering the medicine at nothing.
    const { catalogVersion } = await import("@/lib/repos/batches");
    const before = await catalogVersion();
    const c = createClient({ url: `file:${DB_FILE}` });
    const id = await makeItem(c, "Version Bump Check", 0, 0);
    c.close();
    await sell(id, 1, 4200);
    expect(await catalogVersion()).not.toBe(before);
  });
});
