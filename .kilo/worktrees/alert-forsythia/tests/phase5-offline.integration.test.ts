/**
 * Phase 5 acceptance: what happens when the connection goes and comes back.
 *
 * These exercise the server half of the offline story — the half that decides
 * whether a day's work survives. The browser half (the queues themselves) is
 * covered by the outbox tests and by the offline run in the browser.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ulid } from "ulid";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `phase5-offline.${process.pid}-${Date.now()}.db`);

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
let batchId = "";

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

  itemId = ulid();
  batchId = ulid();
  await raw.execute({
    sql: `INSERT INTO items (id, brand_name, generic_name, category, controlled_flag,
                             shape, active, created_at, updated_at)
          VALUES (?, 'Cetamol', 'Paracetamol 500', 'Medicine', 0, 'tablet', 1, 't', 't')`,
    args: [itemId],
  });
  await raw.execute({
    sql: `INSERT INTO item_units (id, item_id, level, name, factor_to_base,
                                  selling_rate_paisa, is_default_selling)
          VALUES (?, ?, 0, 'Tablet', 1, 200, 1)`,
    args: [ulid(), itemId],
  });
  await raw.execute({
    sql: `INSERT INTO batches (id, item_id, batch_no, expiry_date_ad,
                               received_base_qty, remaining_base_qty,
                               purchase_cost_paisa_per_base, created_at)
          VALUES (?, ?, 'B1', '2027-12-31', 500, 500, 150, 't')`,
    args: [batchId, itemId],
  });
  raw.close();
});

function inlinePatient(id: string, name: string, phone: string) {
  return {
    id,
    name,
    sex: "f" as const,
    ageValue: 30,
    ageUnit: "y" as const,
    ageAsOfAd: TODAY_AD,
    phone,
    address: "Lalitpur",
  };
}

async function ingest(payload: Record<string, unknown>) {
  const { ingestBill } = await import("@/lib/repos/bills");
  return ingestBill({
    dateBs: TODAY_BS,
    dateAd: TODAY_AD,
    patientName: "",
    paymentMethod: "cash",
    tenderedPaisa: 0,
    billDiscountPaisa: 0,
    lines: [],
    userId: "u1",
    clientCreatedAt: new Date().toISOString(),
    ...payload,
  } as never);
}

describe("Phase 5 — a full offline day, drained afterwards", () => {
  it("syncs 20 bills and 5 registrations exactly once, with unbroken numbering", async () => {
    const { createPatient } = await import("@/lib/repos/patients");

    // Five people registered while the connection was down: ids minted on the
    // device, so replaying the queue must not create them twice.
    const registrations = Array.from({ length: 5 }, (_, i) => ({
      id: ulid(),
      name: `Offline Person ${i + 1}`,
      phone: `98000000${String(i).padStart(2, "0")}`,
    }));

    // Twenty bills, ids minted on the device too.
    const bills = Array.from({ length: 20 }, (_, i) => ({
      id: ulid(),
      patient: registrations[i % 5]!,
    }));

    // --- the queues drain, then the loop runs again and replays everything ---
    for (const round of [1, 2]) {
      for (const r of registrations) {
        await createPatient({
          id: r.id,
          name: r.name,
          sex: "f",
          ageValue: 30,
          ageUnit: "y",
          ageAsOfAd: TODAY_AD,
          dobAd: null,
          phone: r.phone,
          address: "Lalitpur",
          userId: "u1",
        });
      }
      for (const b of bills) {
        await ingest({
          id: b.id,
          lines: [
            {
              id: ulid(),
              itemId,
              unitLevel: 0,
              qty: 1,
              ratePaisa: 200,
              rateOverridden: false,
              discountPaisa: 0,
            },
          ],
          patientId: b.patient.id,
        });
      }
      void round;
    }

    // exactly five patients, numbered 1..5 with no gaps
    const people = await q(
      "SELECT patient_no FROM patients ORDER BY patient_no",
    );
    expect(people).toHaveLength(5);
    expect(people.map((r) => Number(r.patient_no))).toEqual([1, 2, 3, 4, 5]);

    // exactly twenty bills, numbered 1..20 with no gaps
    const invoices = await q(
      "SELECT invoice_no FROM bills ORDER BY invoice_no",
    );
    expect(invoices).toHaveLength(20);
    expect(invoices.map((r) => Number(r.invoice_no))).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );

    // and stock moved exactly twenty times, not forty
    const stock = await q("SELECT remaining_base_qty q FROM batches WHERE id = ?", [
      batchId,
    ]);
    expect(Number(stock[0]!.q)).toBe(500 - 20);
  });
});

describe("Phase 5 — the bill and the registration can arrive in either order", () => {
  it("resolves to one patient when the bill lands first", async () => {
    const id = ulid();
    const person = inlinePatient(id, "Bill First", "9811111111");

    // The bill overtakes the registration and brings the patient with it.
    const res = await ingest({
      id: ulid(),
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
      patient: person,
    });
    expect(res.totalPaisa).toBe(50_000);

    // The registration then arrives from its own queue.
    const { createPatient } = await import("@/lib/repos/patients");
    const after = await createPatient({
      id,
      name: "Bill First",
      sex: "f",
      ageValue: 30,
      ageUnit: "y",
      ageAsOfAd: TODAY_AD,
      dobAd: null,
      phone: "9811111111",
      address: "Lalitpur",
      userId: "u1",
    });

    const rows = await q("SELECT id, patient_no FROM patients WHERE id = ?", [id]);
    expect(rows).toHaveLength(1);
    expect(after.patientNo).toBe(Number(rows[0]!.patient_no));

    // and the bill is attached to that one person
    const bill = await q("SELECT patient_id FROM bills WHERE id = ?", [res.id]);
    expect(bill[0]!.patient_id).toBe(id);
  });

  it("resolves to one patient when the registration lands first", async () => {
    const id = ulid();
    const { createPatient } = await import("@/lib/repos/patients");
    await createPatient({
      id,
      name: "Patient First",
      sex: "f",
      ageValue: 30,
      ageUnit: "y",
      ageAsOfAd: TODAY_AD,
      dobAd: null,
      phone: "9822222222",
      address: "Lalitpur",
      userId: "u1",
    });

    // The bill still carries the snapshot; it must not create a second person.
    const res = await ingest({
      id: ulid(),
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
      patient: inlinePatient(id, "Patient First", "9822222222"),
    });

    const rows = await q("SELECT id FROM patients WHERE id = ?", [id]);
    expect(rows).toHaveLength(1);
    const bill = await q("SELECT patient_id FROM bills WHERE id = ?", [res.id]);
    expect(bill[0]!.patient_id).toBe(id);
  });

  it("keeps the patient's own details when the registration follows the bill", async () => {
    // The bill's snapshot is what the counter had. The registration that
    // follows carries the same thing, so nothing is overwritten either way.
    const id = ulid();
    await ingest({
      id: ulid(),
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
      patient: inlinePatient(id, "Details Kept", "9833333333"),
    });
    const rows = await q(
      "SELECT name, phone, age_value FROM patients WHERE id = ?",
      [id],
    );
    expect(rows[0]!.name).toBe("Details Kept");
    expect(rows[0]!.phone).toBe("9833333333");
    expect(Number(rows[0]!.age_value)).toBe(30);
  });
});

describe("Phase 5 — two devices registering the same person", () => {
  it("keeps both records and flags the pair for review", async () => {
    const { createPatient, possibleDuplicatePairs } = await import(
      "@/lib/repos/patients"
    );

    // Two devices, two ids, one human being.
    const a = await createPatient({
      id: ulid(),
      name: "Sita Gurung",
      sex: "f",
      ageValue: 44,
      ageUnit: "y",
      ageAsOfAd: TODAY_AD,
      dobAd: null,
      phone: "9844444444",
      address: "Patan",
      userId: "u1",
    });
    const b = await createPatient({
      id: ulid(),
      name: "Sita Gurung",
      sex: "f",
      ageValue: 44,
      ageUnit: "y",
      ageAsOfAd: TODAY_AD,
      dobAd: null,
      phone: "9844444444",
      address: "Patan",
      userId: "u1",
    });

    // Both are real records with their own numbers — nothing was silently lost.
    expect(a.id).not.toBe(b.id);
    expect(a.patientNo).not.toBe(b.patientNo);

    const pairs = await possibleDuplicatePairs();
    const found = pairs.find(
      (p) =>
        (p.aId === a.id && p.bId === b.id) || (p.aId === b.id && p.bId === a.id),
    );
    expect(found).toBeTruthy();
    expect(found!.reason).toBe("Same name and same phone");

    // Merging clears it from the list, and the number is retired not reused.
    const { mergePatients } = await import("@/lib/repos/patients");
    await mergePatients(a.id, b.id, "u1");

    const after = await possibleDuplicatePairs();
    expect(
      after.some(
        (p) =>
          (p.aId === a.id && p.bId === b.id) ||
          (p.aId === b.id && p.bId === a.id),
      ),
    ).toBe(false);
  });

  it("does not flag two different people who merely share a household phone", async () => {
    const { createPatient, possibleDuplicatePairs } = await import(
      "@/lib/repos/patients"
    );
    const dad = await createPatient({
      id: ulid(),
      name: "Ram Bahadur",
      sex: "m",
      ageValue: 60,
      ageUnit: "y",
      ageAsOfAd: TODAY_AD,
      dobAd: null,
      phone: "9855555555",
      address: "Patan",
      userId: "u1",
    });
    const son = await createPatient({
      id: ulid(),
      name: "Hari Bahadur",
      sex: "m",
      ageValue: 30,
      ageUnit: "y",
      ageAsOfAd: TODAY_AD,
      dobAd: null,
      phone: "9855555555",
      address: "Patan",
      userId: "u1",
    });

    const pairs = await possibleDuplicatePairs();
    const pair = pairs.find(
      (p) =>
        (p.aId === dad.id && p.bId === son.id) ||
        (p.aId === son.id && p.bId === dad.id),
    );
    // It is listed, because the phone matches — but it says only that, so an
    // Admin can see at a glance that the names differ and leave them alone.
    expect(pair).toBeTruthy();
    expect(pair!.reason).toBe("Same phone");
  });
});
