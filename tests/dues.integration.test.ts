/**
 * Dues, end to end: a bill sold with part of it paid or none of it, the
 * money coming in later, a return on a bill still owing, a payment undone,
 * a bill cancelled, a debt from a year that has since closed, and the day
 * close adding all of it up to the cash that should be in the drawer.
 *
 * Every expected figure is worked out by hand in the comments, so a failure
 * says which rupee went missing rather than only that something did.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ulid } from "ulid";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `dues.${process.pid}-${Date.now()}.db`);
const LEGACY_FILE = join(__dirname, `dues-legacy.${process.pid}-${Date.now()}.db`);
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

function migrationFiles(): string[] {
  return readdirSync(MIG_DIR).filter((n) => n.endsWith(".sql")).sort();
}

let TODAY_AD = "";
let TODAY_BS = "";
let itemId = "";
let sita = "";
let hari = "";

async function q(sql: string, args: unknown[] = []) {
  const { db } = await import("@/lib/db");
  return (await db().execute({ sql, args: args as never })).rows;
}

/** 1 tablet = Rs 10 (1,000 paisa). */
async function sell(input: {
  id: string;
  qty: number;
  method: "cash" | "qr" | "credit";
  patientId?: string;
  patientName?: string;
  paidNowPaisa?: number;
  paidNowMethod?: "cash" | "qr";
}) {
  const { ingestBill } = await import("@/lib/repos/bills");
  return ingestBill({
    id: input.id,
    dateBs: TODAY_BS,
    dateAd: TODAY_AD,
    patientName: input.patientName ?? "",
    patientId: input.patientId ?? null,
    paymentMethod: input.method,
    tenderedPaisa: 0,
    paidNowPaisa: input.paidNowPaisa,
    paidNowMethod: input.paidNowMethod,
    billDiscountPaisa: 0,
    userId: "u1",
    clientCreatedAt: new Date().toISOString(),
    lines: [
      {
        id: `${input.id}-L1`,
        itemId,
        unitLevel: 0,
        qty: input.qty,
        ratePaisa: 1_000,
        rateOverridden: false,
        discountPaisa: 0,
      },
    ],
  });
}

afterAll(() => {
  for (const f of [DB_FILE, LEGACY_FILE]) {
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        rmSync(`${f}${suffix}`, { force: true });
      } catch {
        // a lingering handle on Windows — the unique name makes it harmless
      }
    }
  }
});

beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
  const { __resetDbForTests } = await import("@/lib/db");
  __resetDbForTests();

  const raw = createClient({ url: `file:${DB_FILE}` });
  for (const f of migrationFiles()) {
    for (const stmt of split(readFileSync(join(MIG_DIR, f), "utf8"))) {
      await raw.execute(stmt);
    }
  }
  const now = new Date().toISOString();
  await raw.execute({
    sql: `INSERT INTO users (id, name, username, password_hash, role, created_at)
          VALUES ('u1','Bikash','bikash','x','staff',?), ('u2','Owner','owner','x','admin',?)`,
    args: [now, now],
  });
  raw.close();

  const { today, toAD, adToIso, bsToDbText } = await import("@/lib/bs");
  const t = today();
  TODAY_BS = bsToDbText(t);
  TODAY_AD = adToIso(toAD(t));

  const { createItem } = await import("@/lib/repos/items");
  const { createBatchWithStock } = await import("@/lib/repos/batches");
  itemId = await createItem({
    brandName: "Dues Tab", genericName: "", category: "Medicine", manufacturer: "",
    minStockBaseQty: 0, controlledFlag: false, preferredSupplierId: null, active: true, shape: "tablet",
    units: [{ level: 0, name: "Tablet", factorToBase: 1, sellingRatePaisa: 1_000, isDefaultSelling: true }],
  });
  const exp = new Date(Date.now() + 400 * 86400000);
  await createBatchWithStock({
    itemId, batchNo: "D1", mfgDateAd: null, expiryDateAd: adToIso(exp),
    costPaisaPerBase: 500, baseQty: 1_000, supplierId: null, purchaseId: null, userId: "u1", reason: "purchase",
  });

  const { createPatient } = await import("@/lib/repos/patients");
  const base = { sex: "f" as const, ageValue: 40, ageUnit: "y" as const, ageAsOfAd: TODAY_AD, dobAd: null, address: "", userId: "u1" };
  sita = (await createPatient({ ...base, name: "Sita Sample", phone: "9841000001" })).id;
  hari = (await createPatient({ ...base, sex: "m", name: "Hari Sample", phone: "9841000002" })).id;
});

describe("selling on dues", () => {
  it("puts the whole total on dues when nothing is paid", async () => {
    await sell({ id: "B1", qty: 10, method: "credit", patientId: sita, paidNowPaisa: 0, paidNowMethod: "cash" });
    const row = (await q("SELECT payment_method, due_paisa, paid_now_method, total_paisa FROM bills WHERE id='B1'"))[0]!;
    expect(row.payment_method).toBe("credit");
    expect(Number(row.total_paisa)).toBe(10_000);
    expect(Number(row.due_paisa)).toBe(10_000);
    expect(row.paid_now_method).toBeNull();

    const { getBillDues } = await import("@/lib/repos/dues");
    const d = (await getBillDues("B1"))!;
    expect(d.onDues).toBe(true);
    expect(d.paidAtSalePaisa).toBe(0);
    expect(d.balancePaisa).toBe(10_000);
  });

  it("owes the rest after a part payment, and remembers it was paid by QR", async () => {
    // 5 tablets = Rs 50; Rs 20 by QR now, Rs 30 owed
    await sell({ id: "B2", qty: 5, method: "credit", patientId: sita, paidNowPaisa: 2_000, paidNowMethod: "qr" });
    const row = (await q("SELECT payment_method, due_paisa, paid_now_method FROM bills WHERE id='B2'"))[0]!;
    expect(row.payment_method).toBe("credit");
    expect(Number(row.due_paisa)).toBe(3_000);
    expect(row.paid_now_method).toBe("qr");
  });

  it("refuses a bill on dues that says nobody owes it", async () => {
    const { DueBillError } = await import("@/lib/repos/bills");
    await expect(
      sell({ id: "B-nobody", qty: 1, method: "credit", paidNowPaisa: 0, paidNowMethod: "cash" }),
    ).rejects.toBeInstanceOf(DueBillError);
    // nothing was written and no stock moved
    expect(await q("SELECT id FROM bills WHERE id='B-nobody'")).toHaveLength(0);
  });

  it("accepts a typed name when there is no registered patient", async () => {
    await sell({ id: "B3", qty: 1, method: "credit", patientName: "Ram Walk-in", paidNowPaisa: 0, paidNowMethod: "cash" });
    const row = (await q("SELECT due_paisa FROM bills WHERE id='B3'"))[0]!;
    expect(Number(row.due_paisa)).toBe(1_000);
  });

  it("still lands a credit bill queued before part payments existed, with no name", async () => {
    // no paidNowPaisa at all: an older counter's payload
    await sell({ id: "B4", qty: 1, method: "credit" });
    const row = (await q("SELECT payment_method, due_paisa FROM bills WHERE id='B4'"))[0]!;
    expect(row.payment_method).toBe("credit");
    expect(Number(row.due_paisa)).toBe(1_000);
  });

  it("stores a bill paid in full at the counter as an ordinary bill", async () => {
    await sell({ id: "B5", qty: 5, method: "credit", patientId: hari, paidNowPaisa: 5_000, paidNowMethod: "cash" });
    const row = (await q("SELECT payment_method, due_paisa FROM bills WHERE id='B5'"))[0]!;
    expect(row.payment_method).toBe("cash");
    expect(Number(row.due_paisa)).toBe(0);
  });

  it("is idempotent on the bill, like every other bill", async () => {
    const again = await sell({ id: "B2", qty: 5, method: "credit", patientId: sita, paidNowPaisa: 2_000, paidNowMethod: "qr" });
    expect(again.alreadyExisted).toBe(true);
    expect(await q("SELECT id FROM bills WHERE id='B2'")).toHaveLength(1);
  });
});

describe("who owes what", () => {
  it("groups bills by person, oldest first", async () => {
    const { listDuePeople } = await import("@/lib/repos/dues");
    const people = await listDuePeople(TODAY_AD);
    const s = people.find((p) => p.patientId === sita)!;
    // B1 Rs 100 + B2 Rs 30
    expect(s.owedPaisa).toBe(13_000);
    expect(s.bills.map((b) => b.id)).toEqual(["B1", "B2"]);
    expect(s.name).toBe("Sita Sample");
    expect(s.phone).toBe("9841000001");
    // Hari paid everything; Ram and the nameless bill each stand alone
    expect(people.find((p) => p.patientId === hari)).toBeUndefined();
    expect(people.find((p) => p.name === "Ram Walk-in")?.owedPaisa).toBe(1_000);
    expect(people).toHaveLength(3);
  });

  it("shows the balance on the bill register and the bill itself", async () => {
    const { listBills, getBillDetail } = await import("@/lib/repos/bills");
    const rows = await listBills(50);
    expect(rows.find((b) => b.id === "B2")!.balancePaisa).toBe(3_000);
    expect(rows.find((b) => b.id === "B5")!.balancePaisa).toBe(0);
    const detail = (await getBillDetail("B1"))!;
    expect(detail.balancePaisa).toBe(10_000);
    // the bill page now knows the patient's number
    expect(detail.patientNo).not.toBeNull();
    expect(detail.registeredName).toBe("Sita Sample");
  });

  it("totals the patient's dues for their card", async () => {
    const { owedByPatient } = await import("@/lib/repos/dues");
    expect(await owedByPatient(sita)).toEqual({ owedPaisa: 13_000, billCount: 2 });
    expect(await owedByPatient(hari)).toEqual({ owedPaisa: 0, billCount: 0 });
  });
});

describe("receiving money", () => {
  const R1 = ulid();

  it("clears the oldest bill first", async () => {
    const { receiveDuePayment } = await import("@/lib/repos/dues");
    // Rs 110: all of B1 (Rs 100), then Rs 10 of B2
    const res = await receiveDuePayment({
      receiptId: R1, billIds: ["B2", "B1"], amountPaisa: 11_000, method: "cash",
      note: "brought by son", dateAd: TODAY_AD, dateBs: TODAY_BS, userId: "u1",
    });
    expect(res.alreadyExisted).toBe(false);
    expect(res.allocations).toEqual([
      { billId: "B1", amountPaisa: 10_000 },
      { billId: "B2", amountPaisa: 1_000 },
    ]);
    expect(res.stillOwedPaisa).toBe(2_000);
  });

  it("records a double press once", async () => {
    const { receiveDuePayment } = await import("@/lib/repos/dues");
    const res = await receiveDuePayment({
      receiptId: R1, billIds: ["B1", "B2"], amountPaisa: 11_000, method: "cash",
      note: "", dateAd: TODAY_AD, dateBs: TODAY_BS, userId: "u1",
    });
    expect(res.alreadyExisted).toBe(true);
    expect(await q("SELECT id FROM due_payments WHERE receipt_id = ?", [R1])).toHaveLength(2);
    expect(res.stillOwedPaisa).toBe(2_000);
  });

  it("refuses more than is owed, and says how much is", async () => {
    const { receiveDuePayment } = await import("@/lib/repos/dues");
    const { DuePaymentError } = await import("@/lib/dues");
    const err = await receiveDuePayment({
      receiptId: ulid(), billIds: ["B1", "B2"], amountPaisa: 5_000, method: "cash",
      note: "", dateAd: TODAY_AD, dateBs: TODAY_BS, userId: "u1",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(DuePaymentError);
    expect(err.userMessage).toBe("That is more than is owed. They owe रू 20.00.");
  });

  it("refuses one payment across two people's bills", async () => {
    const { receiveDuePayment } = await import("@/lib/repos/dues");
    const { DuePaymentError } = await import("@/lib/dues");
    await expect(
      receiveDuePayment({
        receiptId: ulid(), billIds: ["B2", "B3"], amountPaisa: 500, method: "cash",
        note: "", dateAd: TODAY_AD, dateBs: TODAY_BS, userId: "u1",
      }),
    ).rejects.toBeInstanceOf(DuePaymentError);
  });

  it("refuses nothing, and a payment method it does not know", async () => {
    const { receiveDuePayment } = await import("@/lib/repos/dues");
    const { DuePaymentError } = await import("@/lib/dues");
    const base = { receiptId: ulid(), billIds: ["B2"], note: "", dateAd: TODAY_AD, dateBs: TODAY_BS, userId: "u1" };
    await expect(receiveDuePayment({ ...base, amountPaisa: 0, method: "cash" })).rejects.toBeInstanceOf(DuePaymentError);
    await expect(
      receiveDuePayment({ ...base, amountPaisa: 100, method: "cheque" as never }),
    ).rejects.toBeInstanceOf(DuePaymentError);
  });

  it("lists the payment once, however many bills it cleared", async () => {
    const { listDueReceipts } = await import("@/lib/repos/dues");
    const receipts = await listDueReceipts();
    const r = receipts.find((x) => x.receiptId === R1)!;
    expect(r.amountPaisa).toBe(11_000);
    expect(r.bills.map((b) => b.id).sort()).toEqual(["B1", "B2"]);
    expect(r.name).toBe("Sita Sample");
    expect(r.note).toBe("brought by son");
    expect(r.yearOpen).toBe(true);
    expect(r.voided).toBe(false);
  });

  it("writes it to the audit log without the patient's name", async () => {
    const rows = await q("SELECT detail_json FROM audit_log WHERE action = 'dues.received'");
    expect(rows).toHaveLength(1);
    expect(String(rows[0]!.detail_json)).not.toContain("Sita");
  });
});

describe("a return on a bill still owing", () => {
  it("comes off the debt first and hands back only the rest", async () => {
    const { createSaleReturn } = await import("@/lib/repos/sale-returns");
    // B2: Rs 50, paid Rs 20 + Rs 10, owes Rs 20. Three tablets (Rs 30) come
    // back: Rs 20 clears the debt, Rs 10 is handed back.
    const res = await createSaleReturn({
      billId: "B2", dateAd: TODAY_AD, dateBs: TODAY_BS, userId: "u1",
      lines: [{ billLineId: "B2-L1", itemId, returnBaseQty: 3, amountPaisa: 3_000 }],
    });
    expect(res.againstDuePaisa).toBe(2_000);
    expect(res.handBackPaisa).toBe(1_000);

    const { getBillDues } = await import("@/lib/repos/dues");
    const d = (await getBillDues("B2"))!;
    expect(d.returnedAgainstDuePaisa).toBe(2_000);
    expect(d.balancePaisa).toBe(0);
  });

  it("hands everything back on a bill that owes nothing", async () => {
    const { createSaleReturn } = await import("@/lib/repos/sale-returns");
    const res = await createSaleReturn({
      billId: "B5", dateAd: TODAY_AD, dateBs: TODAY_BS, userId: "u1",
      lines: [{ billLineId: "B5-L1", itemId, returnBaseQty: 1, amountPaisa: 1_000 }],
    });
    expect(res.againstDuePaisa).toBe(0);
    expect(res.handBackPaisa).toBe(1_000);
  });
});

describe("the day close", () => {
  it("counts only money actually taken, and adds dues paid back", async () => {
    const { daySummary } = await import("@/lib/repos/reports");
    const d = await daySummary(TODAY_AD);
    // bills: B1 100 dues · B2 50 (20 QR, 30 dues) · B3 10 dues · B4 10 dues · B5 50 cash
    expect(d.grossSalesPaisa).toBe(22_000);
    expect(d.byMethod).toEqual({ cash: 5_000, qr: 2_000, credit: 15_000 });
    expect(d.byMethod.cash + d.byMethod.qr + d.byMethod.credit).toBe(d.grossSalesPaisa);
    expect(d.duesReceived).toEqual({ cash: 11_000, qr: 0 });
    // returns: B2 Rs 30 (20 off dues) + B5 Rs 10
    expect(d.returnsPaisa).toBe(4_000);
    expect(d.returnsAgainstDuePaisa).toBe(2_000);
    // 50 cash sales + 110 dues in cash − (40 returned − 20 taken off dues)
    expect(d.expectedCashPaisa).toBe(14_000);
  });
});

describe("undoing a payment entered by mistake", () => {
  it("puts the money back onto what is owed and keeps the row, marked undone", async () => {
    const { listDueReceipts, voidDueReceipt, owedByPatient } = await import("@/lib/repos/dues");
    const receipt = (await listDueReceipts()).find((r) => r.amountPaisa === 11_000)!;
    const res = await voidDueReceipt(receipt.receiptId, "u2");
    expect(res.amountPaisa).toBe(11_000);

    // B1 owes Rs 100 again. B2: Rs 30 was left owing, Rs 20 came off it in the
    // return, and Rs 10 was handed back against a payment that never happened
    // — so Rs 10 is owed.
    expect(await owedByPatient(sita)).toEqual({ owedPaisa: 11_000, billCount: 2 });
    const after = (await listDueReceipts()).find((r) => r.receiptId === receipt.receiptId)!;
    expect(after.voided).toBe(true);

    const { daySummary } = await import("@/lib/repos/reports");
    const d = await daySummary(TODAY_AD);
    expect(d.duesReceived).toEqual({ cash: 0, qr: 0 });
    expect(d.expectedCashPaisa).toBe(3_000);
  });

  it("does nothing the second time", async () => {
    const { listDueReceipts, voidDueReceipt } = await import("@/lib/repos/dues");
    const receipt = (await listDueReceipts()).find((r) => r.voided)!;
    expect((await voidDueReceipt(receipt.receiptId, "u2")).amountPaisa).toBe(0);
  });

  it("leaves a payment recorded in a closed year alone", async () => {
    const { receiveDuePayment, voidDueReceipt } = await import("@/lib/repos/dues");
    const { ClosedFiscalYearError } = await import("@/lib/repos/fiscal");
    const rid = ulid();
    await receiveDuePayment({
      receiptId: rid, billIds: ["B4"], amountPaisa: 100, method: "cash",
      note: "", dateAd: TODAY_AD, dateBs: TODAY_BS, userId: "u1",
    });
    await q(
      `INSERT INTO fiscal_years (bs_label, start_ad, end_ad, active, status)
       VALUES ('2070/71', '2013-07-16', '2014-07-16', 0, 'closed')`,
    );
    const closed = (await q("SELECT id FROM fiscal_years WHERE bs_label = '2070/71'"))[0]!.id;
    await q("UPDATE due_payments SET fiscal_year_id = ? WHERE receipt_id = ?", [closed, rid]);
    await expect(voidDueReceipt(rid, "u2")).rejects.toBeInstanceOf(ClosedFiscalYearError);
  });
});

describe("a debt from a year that has since closed", () => {
  it("is still collected, and the money is recorded in the year that is open", async () => {
    const { receiveDuePayment, getBillDues } = await import("@/lib/repos/dues");
    const closed = Number((await q("SELECT id FROM fiscal_years WHERE bs_label = '2070/71'"))[0]!.id);
    const open = Number((await q("SELECT id FROM fiscal_years WHERE status = 'open'"))[0]!.id);
    await sell({ id: "B-old", qty: 2, method: "credit", patientId: hari, paidNowPaisa: 0, paidNowMethod: "cash" });
    await q("UPDATE bills SET fiscal_year_id = ? WHERE id = 'B-old'", [closed]);

    const rid = ulid();
    await receiveDuePayment({
      receiptId: rid, billIds: ["B-old"], amountPaisa: 2_000, method: "qr",
      note: "", dateAd: TODAY_AD, dateBs: TODAY_BS, userId: "u1",
    });
    const pay = (await q("SELECT fiscal_year_id FROM due_payments WHERE receipt_id = ?", [rid]))[0]!;
    expect(Number(pay.fiscal_year_id)).toBe(open);
    // and nothing on the old bill itself was written
    const bill = (await q("SELECT fiscal_year_id, due_paisa FROM bills WHERE id = 'B-old'"))[0]!;
    expect(Number(bill.fiscal_year_id)).toBe(closed);
    expect(Number(bill.due_paisa)).toBe(2_000);
    expect((await getBillDues("B-old"))!.balancePaisa).toBe(0);
  });
});

describe("cancelling a bill on dues", () => {
  it("takes it off the dues list and its payments out of the day", async () => {
    const { receiveDuePayment, listOwedBills } = await import("@/lib/repos/dues");
    const { cancelBill } = await import("@/lib/repos/bills");
    const { daySummary } = await import("@/lib/repos/reports");

    await receiveDuePayment({
      receiptId: ulid(), billIds: ["B3"], amountPaisa: 500, method: "cash",
      note: "", dateAd: TODAY_AD, dateBs: TODAY_BS, userId: "u1",
    });
    const before = await daySummary(TODAY_AD);
    await cancelBill("B3", "u2");
    const after = await daySummary(TODAY_AD);

    expect((await listOwedBills()).some((b) => b.id === "B3")).toBe(false);
    expect(before.duesReceived.cash - after.duesReceived.cash).toBe(500);
    expect(before.byMethod.credit - after.byMethod.credit).toBe(1_000);

    const { listDueReceipts } = await import("@/lib/repos/dues");
    const r = (await listDueReceipts()).find((x) => x.bills.some((b) => b.id === "B3"))!;
    expect(r.billCancelled).toBe(true);
  });
});

describe("a credit bill made by the old counter, after the migration but before the deploy", () => {
  it("is read as owing its whole total, never as paid", async () => {
    // Exactly what the code before 0019 inserts: no due_paisa, so it takes
    // the column's default of 0.
    const { db } = await import("@/lib/db");
    const fy = Number((await q("SELECT id FROM fiscal_years WHERE status = 'open'"))[0]!.id);
    await db().execute({
      sql: `INSERT INTO bills
              (id, invoice_no, fiscal_year_id, date_ad, date_bs, patient_name,
               subtotal_paisa, discount_paisa, vat_paisa, total_paisa,
               payment_method, tendered_paisa, status, user_id, client_created_at,
               synced_at, patient_id, visit_id, kind)
            VALUES ('B-window', 999, ?, ?, ?, 'Window Walk-in', 7000, 0, 0, 7000,
                    'credit', 0, 'saved', 'u1', ?, ?, NULL, NULL, 'pharmacy')`,
      args: [fy, TODAY_AD, TODAY_BS, new Date().toISOString(), new Date().toISOString()],
    });
    const { getBillDues, listOwedBills } = await import("@/lib/repos/dues");
    const { daySummary } = await import("@/lib/repos/reports");
    const before = await daySummary(TODAY_AD);

    const d = (await getBillDues("B-window"))!;
    expect(d.duePaisa).toBe(7_000);
    expect(d.paidAtSalePaisa).toBe(0);
    expect(d.balancePaisa).toBe(7_000);
    expect((await listOwedBills()).find((b) => b.id === "B-window")?.balancePaisa).toBe(7_000);

    // and the day close counts it as owed, not as cash in the drawer
    await db().execute("UPDATE bills SET status = 'cancelled' WHERE id = 'B-window'");
    const without = await daySummary(TODAY_AD);
    expect(before.byMethod.credit - without.byMethod.credit).toBe(7_000);
    expect(before.byMethod.cash - without.byMethod.cash).toBe(0);
    expect(before.expectedCashPaisa).toBe(without.expectedCashPaisa);
  });
});

describe("the dashboard", () => {
  it("adds up what everybody owes", async () => {
    const { duesTotals, listOwedBills } = await import("@/lib/repos/dues");
    const bills = await listOwedBills();
    const t = await duesTotals();
    expect(t.owedPaisa).toBe(bills.reduce((s, b) => s + b.balancePaisa, 0));
    // Sita (B1 + B2) and the nameless B4
    expect(t.people).toBe(2);
  });
});

describe("backups", () => {
  it("brings a backup made before part payments back with its credit bills still owing", async () => {
    const { exportAll, restoreAll } = await import("@/lib/repos/backup");
    const archive = await exportAll();
    expect(archive.tables.due_payments!.length).toBeGreaterThan(0);

    // An archive from before 0019: no due_paisa on any bill, no payments.
    const old = structuredClone(archive);
    for (const b of old.tables.bills!) delete (b as Record<string, unknown>).due_paisa;
    old.tables.due_payments = [];
    await restoreAll(old);
    const { getBillDues } = await import("@/lib/repos/dues");
    // B1 was sold with nothing paid; with no payments in the archive it owes
    // its whole total again. B5 was paid in full and owes nothing.
    expect((await getBillDues("B1"))!.balancePaisa).toBe(10_000);
    expect((await getBillDues("B5"))!.balancePaisa).toBe(0);

    // and a current archive comes back exactly
    await restoreAll(archive);
    const b2 = (await q("SELECT due_paisa, paid_now_method FROM bills WHERE id = 'B2'"))[0]!;
    expect(Number(b2.due_paisa)).toBe(3_000);
    expect(b2.paid_now_method).toBe("qr");
    expect(await q("SELECT id FROM due_payments")).toHaveLength(archive.tables.due_payments!.length);
  });
});

describe("migration 0019 on a database that already has credit bills", () => {
  it("owes each unsettled credit bill its total, less what returns took off it", async () => {
    const raw = createClient({ url: `file:${LEGACY_FILE}` });
    const files = migrationFiles();
    const upTo = files.indexOf("0019_dues.sql");
    expect(upTo).toBeGreaterThan(0);
    for (const f of files.slice(0, upTo)) {
      for (const stmt of split(readFileSync(join(MIG_DIR, f), "utf8"))) await raw.execute(stmt);
    }
    const now = new Date().toISOString();
    await raw.execute(`INSERT INTO fiscal_years (bs_label, start_ad, end_ad, active, status)
                       VALUES ('2083/84','2026-07-17','2027-07-16',1,'open')`);
    const bill = (id: string, method: string, total: number, settled: string | null) =>
      raw.execute({
        sql: `INSERT INTO bills (id, invoice_no, fiscal_year_id, date_ad, date_bs, total_paisa,
                                 payment_method, status, credit_settled_at, client_created_at)
              VALUES (?, 1, 1, '2026-09-01', '2083-05-16', ?, ?, 'saved', ?, ?)`,
        args: [id, total, method, settled, now],
      });
    await bill("L-open", "credit", 10_000, null);
    await bill("L-settled", "credit", 8_000, now);
    await bill("L-cash", "cash", 5_000, null);
    const ret = (id: string, billId: string, total: number) =>
      raw.execute({
        sql: `INSERT INTO sale_returns (id, bill_id, date_ad, date_bs, total_paisa, created_at)
              VALUES (?, ?, '2026-09-02', '2083-05-17', ?, ?)`,
        args: [id, billId, total, now],
      });
    // Two returns on the unsettled bill: the second is larger than what is
    // left of the debt, so it takes only what is left.
    await ret("R1", "L-open", 6_000);
    await ret("R2", "L-open", 7_000);
    await ret("R3", "L-settled", 1_000);
    await ret("R4", "L-cash", 1_000);

    const counts = async () =>
      (await raw.execute("SELECT (SELECT COUNT(*) FROM bills) b, (SELECT COUNT(*) FROM sale_returns) r")).rows[0]!;
    const before = await counts();
    for (const stmt of split(readFileSync(join(MIG_DIR, "0019_dues.sql"), "utf8"))) await raw.execute(stmt);
    const after = await counts();
    expect(Number(after.b)).toBe(Number(before.b));
    expect(Number(after.r)).toBe(Number(before.r));

    const dues = Object.fromEntries(
      (await raw.execute("SELECT id, due_paisa FROM bills")).rows.map((r) => [r.id, Number(r.due_paisa)]),
    );
    expect(dues).toEqual({ "L-open": 10_000, "L-settled": 8_000, "L-cash": 0 });

    const against = Object.fromEntries(
      (await raw.execute("SELECT id, against_due_paisa FROM sale_returns")).rows.map((r) => [
        r.id,
        Number(r.against_due_paisa),
      ]),
    );
    // R1 takes 6,000 of 10,000; R2 takes the 4,000 that is left
    expect(against).toEqual({ R1: 6_000, R2: 4_000, R3: 0, R4: 0 });

    const { balanceDue } = await import("@/lib/dues");
    expect(
      balanceDue({
        method: "credit", status: "saved", settledInFull: false,
        duePaisa: 10_000, receivedPaisa: 0, returnedAgainstDuePaisa: 10_000,
      }),
    ).toBe(0);
    raw.close();
  });
});
