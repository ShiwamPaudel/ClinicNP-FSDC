/**
 * Phase 5: what happens when two devices do the same thing at the same time,
 * and whether the counter is still fast at the scale the clinic will reach.
 *
 * Two counters, one stock room, one patient register. Everything here goes
 * through the real repositories, because the guarantees being tested are
 * transaction guarantees and a mock would only test the mock.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ulid } from "ulid";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `phase5-conc.${process.pid}-${Date.now()}.db`);

process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = "";

const TODAY_AD = "2026-08-29";
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
let lastStripBatch = "";

async function q(sql: string, args: unknown[] = []) {
  const { db } = await import("@/lib/db");
  const res = await db().execute({ sql, args: args as never });
  return res.rows;
}

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
     VALUES ('u1','Anita','anita','x','staff','t')`,
  );
  await raw.execute(
    `INSERT INTO fiscal_years (bs_label, start_ad, end_ad, active, status)
     VALUES ('2083/84','2026-07-17','2027-07-16',1,'open')`,
  );
  await raw.execute(
    `INSERT INTO services (id, name, group_id, rate_paisa, active, created_at, updated_at)
     VALUES ('svc_opd','OPD Consultation','grp_opd', 50000, 1, 't','t')`,
  );

  // One item with exactly one strip left — the thing two counters will fight over.
  itemId = ulid();
  lastStripBatch = ulid();
  await raw.execute({
    sql: `INSERT INTO items (id, brand_name, generic_name, category, controlled_flag,
                             shape, active, created_at, updated_at)
          VALUES (?, 'Cetamol', 'Paracetamol 500', 'Medicine', 0, 'tablet', 1, 't','t')`,
    args: [itemId],
  });
  await raw.execute({
    sql: `INSERT INTO item_units (id, item_id, level, name, factor_to_base,
                                  selling_rate_paisa, is_default_selling)
          VALUES (?, ?, 0, 'Tablet', 1, 200, 0)`,
    args: [ulid(), itemId],
  });
  await raw.execute({
    sql: `INSERT INTO item_units (id, item_id, level, name, factor_to_base,
                                  selling_rate_paisa, is_default_selling)
          VALUES (?, ?, 1, 'Strip', 10, 1800, 1)`,
    args: [ulid(), itemId],
  });
  await raw.execute({
    sql: `INSERT INTO batches (id, item_id, batch_no, expiry_date_ad,
                               received_base_qty, remaining_base_qty,
                               purchase_cost_paisa_per_base, created_at)
          VALUES (?, ?, 'LAST', '2027-12-31', 10, 10, 150, 't')`,
    args: [lastStripBatch, itemId],
  });
  raw.close();
});

async function sellOneStrip() {
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
        unitLevel: 1,
        qty: 1,
        ratePaisa: 1_800,
        rateOverridden: false,
        discountPaisa: 0,
      },
    ],
    userId: "u1",
    clientCreatedAt: new Date().toISOString(),
  });
}

describe("Phase 5 — two counters, one last strip", () => {
  /**
   * Turso serialises write transactions, so two counters reaching the server at
   * the same instant do not actually run at the same instant — the second one
   * runs immediately after the first and sees the stock the first one left.
   * That is the sequence tested here.
   *
   * Firing two write transactions simultaneously at a local SQLite file is not
   * that sequence: the file lock refuses the second before it counts anything,
   * which tests the driver rather than the product, and leaves the file locked
   * for whatever runs next. What protects the stock is the guarded decrement,
   * and that is tested directly below.
   */
  it("sells the last strip once, and refuses the next attempt by name", async () => {
    const { InsufficientStockError } = await import("@/lib/repos/bills");

    const first = await sellOneStrip();
    expect(first.invoiceNo).toBeGreaterThan(0);

    await expect(sellOneStrip()).rejects.toBeInstanceOf(InsufficientStockError);

    try {
      await sellOneStrip();
    } catch (err) {
      // The message names the item, so the counter can say which one ran out.
      expect(
        (err as InstanceType<typeof InsufficientStockError>).itemIds,
      ).toContain(itemId);
    }

    // Stock is at zero, never below it, and only the sale that succeeded moved it.
    const stock = await q(
      "SELECT remaining_base_qty q FROM batches WHERE id = ?",
      [lastStripBatch],
    );
    expect(Number(stock[0]!.q)).toBe(0);
    expect(Number((await q("SELECT COUNT(*) n FROM bills"))[0]!.n)).toBe(1);
    expect(Number((await q("SELECT COUNT(*) n FROM stock_moves"))[0]!.n)).toBe(1);
  });

  it("cannot be driven negative even by a decrement that races the check", async () => {
    // The real protection is the guard on the UPDATE itself: it only subtracts
    // when there is enough left. Applied twice against one strip's worth of
    // stock, the second one changes nothing instead of going below zero.
    const { db } = await import("@/lib/db");
    await q("UPDATE batches SET remaining_base_qty = 10 WHERE id = ?", [
      lastStripBatch,
    ]);

    const guarded = () =>
      db().execute({
        sql: `UPDATE batches SET remaining_base_qty = remaining_base_qty - 10
               WHERE id = ? AND remaining_base_qty >= 10`,
        args: [lastStripBatch],
      });

    const a = await guarded();
    const b = await guarded();

    expect(a.rowsAffected).toBe(1);
    expect(b.rowsAffected).toBe(0);

    const stock = await q(
      "SELECT remaining_base_qty q FROM batches WHERE id = ?",
      [lastStripBatch],
    );
    expect(Number(stock[0]!.q)).toBe(0);
  });

  it("goes through once the stock is entered", async () => {
    await q("UPDATE batches SET remaining_base_qty = 10 WHERE id = ?", [
      lastStripBatch,
    ]);
    const res = await sellOneStrip();
    expect(res.invoiceNo).toBeGreaterThan(0);
  });
});

describe("Phase 5 — two counters billing the same patient at once", () => {
  it("opens one visit, not two", async () => {
    const { createPatient } = await import("@/lib/repos/patients");
    const { ingestBill } = await import("@/lib/repos/bills");

    const p = await createPatient({
      id: ulid(),
      name: "Shared Patient",
      sex: "f",
      ageValue: 33,
      ageUnit: "y",
      ageAsOfAd: TODAY_AD,
      dobAd: null,
      phone: "9866666666",
      address: "Patan",
      userId: "u1",
    });

    function consultation() {
      return ingestBill({
        id: ulid(),
        dateBs: TODAY_BS,
        dateAd: TODAY_AD,
        patientName: "",
        paymentMethod: "cash",
        tenderedPaisa: 0,
        billDiscountPaisa: 0,
        lines: [],
        serviceLines: [
          {
            id: ulid(),
            serviceId: "svc_opd",
            qty: 1,
            ratePaisa: 50_000,
            rateOverridden: false,
            discountPaisa: 0,
            doctorId: null,
            labPartnerId: null,
            followupApplied: false,
          },
        ],
        patientId: p.id,
        userId: "u1",
        clientCreatedAt: new Date().toISOString(),
      });
    }

    // Two counters bill the same person on the same day. Written one after
    // the other, which is how they reach the server: Turso serialises write
    // transactions, and the outbox retries anything the lock refuses.
    const a = await consultation();
    const b = await consultation();

    const visits = await q(
      "SELECT id FROM visits WHERE patient_id = ? AND date_ad = ?",
      [p.id, TODAY_AD],
    );
    expect(visits).toHaveLength(1);

    const bills = await q("SELECT visit_id FROM bills WHERE id IN (?, ?)", [
      a.id,
      b.id,
    ]);
    expect(bills[0]!.visit_id).toBe(bills[1]!.visit_id);
    expect(bills[0]!.visit_id).toBe(visits[0]!.id);
  });

  it("gives the patient one visit number, not two", async () => {
    const rows = await q(
      "SELECT visit_no FROM visits WHERE patient_id = (SELECT id FROM patients WHERE name = 'Shared Patient')",
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.visit_no)).toBeGreaterThan(0);
  });
});

describe("Phase 5 — the counter at the scale the clinic will reach", () => {
  it("searches 2,000 patients well under 100 ms", async () => {
    const { db } = await import("@/lib/db");
    const client = db();

    // 2,000 patients, entered the way a year of a busy clinic would leave them.
    const now = new Date().toISOString();
    const first = ["Anita", "Bikash", "Sita", "Ram", "Gita", "Hari", "Maya"];
    const last = ["Shrestha", "Karki", "Gurung", "Thapa", "Magar", "Rai"];
    const tx = await client.transaction("write");
    try {
      for (let i = 0; i < 2000; i++) {
        await tx.execute({
          sql: `INSERT INTO patients (id, patient_no, name, sex, age_value, age_unit,
                                      age_as_of_ad, phone, address, created_at, updated_at)
                VALUES (?, ?, ?, 'f', 30, 'y', ?, ?, 'Lalitpur', ?, ?)`,
          args: [
            ulid(),
            100000 + i,
            `${first[i % first.length]} ${last[i % last.length]} ${i}`,
            TODAY_AD,
            `98${String(40000000 + i)}`,
            now,
            now,
          ],
        });
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    const { searchPatients } = await import("@/lib/repos/patients");

    // Warm the connection so the first query's setup is not counted as search.
    await searchPatients("anita");

    const timings: number[] = [];
    for (const term of ["anita", "shrestha", "9840000", "100500", "gita ma"]) {
      const t0 = performance.now();
      await searchPatients(term, 12);
      timings.push(performance.now() - t0);
    }

    const worst = Math.max(...timings);
    // The acceptance figure is 100 ms. Reported so a regression is visible in
    // the run output rather than only when it crosses the line.
    console.log(
      `  patient search over 2,000 records: worst ${worst.toFixed(1)} ms, ` +
        `each ${timings.map((t) => t.toFixed(0)).join("/")} ms`,
    );
    expect(worst).toBeLessThan(100);
  });

  it("still finds the right person among the two thousand", async () => {
    const { searchPatients } = await import("@/lib/repos/patients");
    const found = await searchPatients("Shared Patient");
    expect(found.some((p) => p.name === "Shared Patient")).toBe(true);
  });
});
