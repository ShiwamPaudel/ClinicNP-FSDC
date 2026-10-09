/**
 * Doctor payouts, salaries and the tooth chart against a real database with
 * every migration applied (0025, C-037).
 *
 * A doctor on 35% of services is billed a Rs 10,000 crown through the same
 * `ingestBill` the counter uses; their statement, Payables and the financial
 * summary must all say Rs 3,500 earned, and a payout must clear it oldest
 * first and come back when undone. A salary month must work out SSF, recover
 * an advance, and refuse to forget an advance already recovered.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `payouts.${process.pid}-${Date.now()}.db`);
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
const NOW = new Date().toISOString();

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
  const seed: [string, unknown[]][] = [
    [`INSERT INTO users (id, name, username, password_hash, role, created_at) VALUES ('u1','Admin','admin','x','admin',?)`, [NOW]],
    [`INSERT INTO service_groups (id, name, created_at) VALUES ('g1','Dental',?)`, [NOW]],
    [`INSERT INTO doctors (id, name, share_basis, share_value, active, created_at, updated_at)
      VALUES ('d1','Dr. Shakya','pct_services',3500,1,?,?)`, [NOW, NOW]],
    [`INSERT INTO services (id, name, group_id, rate_paisa, created_at, updated_at)
      VALUES ('s1','Crown','g1',1000000,?,?)`, [NOW, NOW]],
    [`INSERT INTO patients (id, patient_no, name, sex, created_at, updated_at)
      VALUES ('p1',1,'Test Patient','f',?,?)`, [NOW, NOW]],
  ];
  for (const [sql, args] of seed) await raw.execute({ sql, args: args as never });
  raw.close();

  const { today, toAD, adToIso, bsToDbText } = await import("@/lib/bs");
  const t = today();
  TODAY_BS = bsToDbText(t);
  TODAY_AD = adToIso(toAD(t));

  const { ingestBill } = await import("@/lib/repos/bills");
  await ingestBill({
    id: "BILL1",
    dateBs: TODAY_BS,
    dateAd: TODAY_AD,
    patientName: "Test Patient",
    patientId: "p1",
    paymentMethod: "cash",
    tenderedPaisa: 0,
    billDiscountPaisa: 0,
    userId: "u1",
    clientCreatedAt: NOW,
    lines: [],
    serviceLines: [
      {
        id: "SL1",
        serviceId: "s1",
        qty: 1,
        ratePaisa: 1_000_000,
        rateOverridden: false,
        discountPaisa: 0,
        doctorId: "d1",
        labPartnerId: null,
        followupApplied: false,
      },
    ],
  });
});

describe("a doctor's share, paid and tallied", () => {
  it("is earned on the bill and owed until paid", async () => {
    const { doctorPayStatement } = await import("@/lib/repos/doctor-pay");
    const st = (await doctorPayStatement("d1"))!;
    expect(st.earnedPaisa).toBe(350_000);
    expect(st.owedPaisa).toBe(350_000);
    expect(st.shares[0]!.status).toBe("unpaid");
  });

  it("a part payout part-pays the share, and Payables agrees", async () => {
    const { recordDoctorPayout, doctorPayStatement } = await import("@/lib/repos/doctor-pay");
    const { doctorPayables } = await import("@/lib/repos/payables");
    await recordDoctorPayout({
      doctorId: "d1", dateAd: TODAY_AD, dateBs: TODAY_BS, amountPaisa: 200_000,
      method: "cash", note: "", userId: "u1",
    });
    const st = (await doctorPayStatement("d1"))!;
    expect(st.shares[0]!.status).toBe("part");
    expect(st.payouts[0]!.covers[0]!.amountPaisa).toBe(200_000);
    expect(st.owedPaisa).toBe(150_000);
    const [row] = await doctorPayables();
    expect(row!.owedPaisa).toBe(150_000);
  });

  it("an undone payout is owed again", async () => {
    const { doctorPayStatement } = await import("@/lib/repos/doctor-pay");
    const { voidPayment } = await import("@/lib/repos/payables");
    const st = (await doctorPayStatement("d1"))!;
    await voidPayment({ kind: "doctor", paymentId: st.payouts[0]!.id, reason: "wrong amount", userId: "u1" });
    const after = (await doctorPayStatement("d1"))!;
    expect(after.owedPaisa).toBe(350_000);
    expect(after.payouts[0]!.voided).toBe(true);
  });

  it("the sales register and the financial summary carry the share", async () => {
    const { salesRegister } = await import("@/lib/repos/reports");
    const { financialSummary } = await import("@/lib/repos/financials");
    const [bill] = await salesRegister(TODAY_AD, TODAY_AD);
    expect(bill!.doctorSharePaisa).toBe(350_000);
    const f = await financialSummary({ fromIso: TODAY_AD, toIso: TODAY_AD, label: "Today", preset: "today" } as never);
    expect(f.billedPaisa).toBe(1_000_000);
    expect(f.doctorSharePaisa).toBe(350_000);
  });
});

describe("a salary month", () => {
  let staffId = "";
  const month = () => TODAY_BS.slice(0, 7);

  it("works out SSF for a member of the fund", async () => {
    const { createStaff, monthSheet } = await import("@/lib/repos/payroll");
    staffId = await createStaff(
      { name: "Sita", designation: "Assistant", phone: "", panNo: "", ssfNo: "", bankAccount: "", note: "", joinedBs: null, leftBs: null },
      { fromMonthBs: month(), monthlySalaryPaisa: 2_000_000, ssfEnrolled: true, sstApplies: false },
      "u1",
    );
    const sheet = await monthSheet(month());
    const row = sheet.rows.find((r) => r.staff.id === staffId)!;
    expect(row.pay.ssfStaffPaisa).toBe(220_000);
    expect(row.pay.ssfEmployerPaisa).toBe(400_000);
    expect(row.pay.netPaisa).toBe(1_780_000);
  });

  it("recovers an advance when the salary is paid, and won't forget it afterwards", async () => {
    const { giveAdvance, paySalary, monthSheet, advancesOutstanding, staffPayments, undoSalaryEntry } =
      await import("@/lib/repos/payroll");
    await giveAdvance({ staffId, dateAd: TODAY_AD, dateBs: TODAY_BS, amountPaisa: 500_000, method: "cash", note: "", userId: "u1" });
    expect((await advancesOutstanding()).get(staffId)).toBe(500_000);

    await paySalary({
      staffId, monthBs: month(), dateAd: TODAY_AD, dateBs: TODAY_BS,
      amountPaisa: 1_480_000, method: "bank", note: "", recoverAdvancePaisa: 300_000, userId: "u1",
    });
    const row = (await monthSheet(month())).rows.find((r) => r.staff.id === staffId)!;
    expect(row.pay.advanceRecoveredPaisa).toBe(300_000);
    expect(row.pay.leftPaisa).toBe(0);
    expect((await advancesOutstanding()).get(staffId)).toBe(200_000);

    const advance = (await staffPayments(staffId)).find((p) => p.kind === "advance")!;
    await expect(
      undoSalaryEntry({ kind: "payment", id: advance.id, reason: "test", userId: "u1" }),
    ).rejects.toThrow(/already been recovered/);
  });

  it("refuses to recover more than is outstanding", async () => {
    const { paySalary } = await import("@/lib/repos/payroll");
    await expect(
      paySalary({
        staffId, monthBs: month(), dateAd: TODAY_AD, dateBs: TODAY_BS,
        amountPaisa: 0, method: "cash", note: "", recoverAdvancePaisa: 900_000, userId: "u1",
      }),
    ).rejects.toThrow(/more than the advance/);
  });
});

describe("the tooth chart", () => {
  it("keeps each mark and undoes one without losing it", async () => {
    const { addToothRecords, toothRecords, undoToothRecord } = await import("@/lib/repos/teeth");
    const { currentTeeth } = await import("@/lib/teeth");
    await addToothRecords({
      patientId: "p1", teeth: [36, 46], condition: "caries", surfaces: "MO", note: "",
      dateAd: TODAY_AD, dateBs: TODAY_BS, userId: "u1",
    });
    let recs = await toothRecords("p1");
    expect(recs).toHaveLength(2);
    expect(currentTeeth(recs).get(36)!.surfaces).toBe("MO");

    const r36 = recs.find((r) => r.tooth === 36)!;
    expect(await undoToothRecord(r36.id, "u1")).toBe("p1");
    recs = await toothRecords("p1");
    expect(recs).toHaveLength(2);
    expect(currentTeeth(recs).has(36)).toBe(false);
  });
});
