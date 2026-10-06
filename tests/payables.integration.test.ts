/**
 * Payables (0023): paying for a purchase as it is entered, paying suppliers
 * and laboratories later, and undoing a payment typed wrong — against an
 * isolated file DB.
 *
 * The supplier's balance was always purchases, less returns, less payments.
 * None of that changes; what is checked here is that a payment made with a
 * purchase lands in exactly that sum, that an undone payment drops out of it
 * everywhere it is read, and that every refusal leaves the database as it was.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `payables.${process.pid}-${Date.now()}.db`);

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
     VALUES ('u1','Shreekrishna','admin','x','admin','t')`,
  );
  await raw.execute(
    `INSERT INTO fiscal_years (bs_label, start_ad, end_ad, active, status)
     VALUES ('2082/83','2025-07-17','2026-07-16',0,'closed'),
            ('2083/84','2026-07-17','2027-07-16',1,'open')`,
  );
  await raw.execute(
    `INSERT INTO suppliers (id, name, created_at) VALUES
       ('s1','Pharmachoice Traders','t'), ('s2','Other Distributor','t'),
       ('s3','Quiet Supplier','t')`,
  );
  await raw.execute(
    `INSERT INTO lab_partners (id, name, active, created_at, updated_at)
     VALUES ('lab1','NOVUS',1,'t','t')`,
  );
  await raw.execute({
    sql: `INSERT INTO items (id, brand_name, generic_name, category, created_at, updated_at)
          VALUES ('cet', 'Cetamol 500', '', 'Medicine', 't', 't')`,
    args: [],
  });
  await raw.execute(
    `INSERT INTO item_units (id, item_id, level, name, factor_to_base, selling_rate_paisa, is_default_selling)
     VALUES ('cet-u0', 'cet', 0, 'Tablet', 1, 0, 0), ('cet-u1', 'cet', 1, 'Strip', 10, 2500, 1)`,
  );
  raw.close();
});

async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []): Promise<T[]> {
  const { db } = await import("@/lib/db");
  const r = await db().execute({ sql, args: args as never });
  return r.rows as unknown as T[];
}

/** 10 strips at रू 20 = रू 200 (20000 paisa). */
function line() {
  return {
    itemId: "cet",
    batchNo: "C-1",
    mfgDateAd: null,
    expiryDateAd: EXPIRY,
    unitLevel: 1,
    factorToBase: 10,
    qty: 10,
    freeQty: 0,
    unitCostPaisa: 2000,
    discountPaisa: 0,
  };
}

async function newPurchase(
  supplierId: string,
  payment?: { mode: "full" | "part"; amountPaisa: number; method: string },
) {
  const { createPurchase } = await import("@/lib/repos/purchases");
  return createPurchase({
    supplierId,
    supplierInvoiceNo: "SB-1",
    dateAd: DATE_AD,
    dateBs: DATE_BS,
    vatPaisa: 0,
    lines: [line()],
    userId: USER,
    payment,
  });
}

async function ledgerBalance(supplierId: string) {
  const { supplierBalance } = await import("@/lib/repos/suppliers");
  return supplierBalance(supplierId);
}

async function payablesOwed(supplierId: string) {
  const { supplierPayables } = await import("@/lib/repos/payables");
  return (await supplierPayables()).find((r) => r.id === supplierId)?.owedPaisa;
}

async function snapshot() {
  return JSON.stringify({
    p: await q("SELECT * FROM purchases ORDER BY id"),
    sp: await q("SELECT * FROM supplier_payments ORDER BY id"),
    lp: await q("SELECT * FROM lab_partner_payments ORDER BY id"),
    b: await q("SELECT * FROM batches ORDER BY id"),
    sm: await q("SELECT * FROM stock_moves ORDER BY id"),
    fy: await q("SELECT * FROM fiscal_years ORDER BY id"),
    audit: await q("SELECT id FROM audit_log ORDER BY id"),
  });
}

describe("paying for a purchase as it is entered", () => {
  it("on credit (no payment) records nothing paid — exactly as before", async () => {
    const before = await ledgerBalance("s1");
    const res = await newPurchase("s1");
    expect(res.paidPaisa).toBe(0);
    const rows = await q("SELECT * FROM supplier_payments WHERE purchase_id = ?", [res.id]);
    expect(rows).toHaveLength(0);
    expect(await ledgerBalance("s1")).toBe(before + 20000);
  });

  it("paid in full pays the total worked out on the server, whatever amount was sent", async () => {
    const before = await ledgerBalance("s1");
    const res = await newPurchase("s1", { mode: "full", amountPaisa: 1, method: "bank" });
    expect(res.paidPaisa).toBe(20000);
    const [row] = await q<Record<string, unknown>>(
      "SELECT * FROM supplier_payments WHERE purchase_id = ?",
      [res.id],
    );
    expect(Number(row!.amount_paisa)).toBe(20000);
    expect(row!.method).toBe("bank");
    expect(row!.supplier_id).toBe("s1");
    expect(row!.date_bs).toBe(DATE_BS);
    expect(row!.voided_at).toBeNull();
    expect(row!.note).toBe(`With purchase ${res.purchaseNo}`);
    // Bill and payment cancel out: the supplier is owed nothing more.
    expect(await ledgerBalance("s1")).toBe(before);
    const audit = await q<{ detail_json: string }>(
      "SELECT detail_json FROM audit_log WHERE action = 'supplier.payment' AND detail_json LIKE ?",
      [`%${res.id}%`],
    );
    expect(audit).toHaveLength(1);
  });

  it("part paid leaves the rest on credit", async () => {
    const before = await ledgerBalance("s1");
    const res = await newPurchase("s1", { mode: "part", amountPaisa: 7500, method: "cash" });
    expect(res.paidPaisa).toBe(7500);
    expect(await ledgerBalance("s1")).toBe(before + 20000 - 7500);
  });

  it("refuses a part payment above the bill, and writes nothing at all", async () => {
    const { PurchaseEditError } = await import("@/lib/repos/purchases");
    const snap = await snapshot();
    await expect(
      newPurchase("s1", { mode: "part", amountPaisa: 20001, method: "cash" }),
    ).rejects.toBeInstanceOf(PurchaseEditError);
    expect(await snapshot()).toBe(snap);
  });

  it("the purchase reads back what was paid with it", async () => {
    const res = await newPurchase("s1", { mode: "part", amountPaisa: 5000, method: "cheque" });
    const { getPurchase } = await import("@/lib/repos/purchases");
    const p = await getPurchase(res.id);
    expect(p!.payments).toEqual([
      expect.objectContaining({ amountPaisa: 5000, method: "cheque", voided: false }),
    ]);
  });
});

describe("the form's payment choice", () => {
  it("is optional, so an older form saves on credit", async () => {
    const { purchaseSchema } = await import("@/lib/validators");
    const base = {
      supplierId: "s1",
      supplierInvoiceNo: "",
      dateBs: DATE_BS,
      applyVat: false,
      lines: [
        {
          itemId: "cet", batchNo: "C-1", mfgDateBs: "", expiryDateBs: "2084-10-18",
          unitLevel: 1, qty: 1, freeQty: 0, unitCostPaisa: 100, discountPaisa: 0,
        },
      ],
    };
    expect(purchaseSchema.safeParse(base).success).toBe(true);
    expect(purchaseSchema.safeParse(base).data!.payment).toBeUndefined();
    expect(
      purchaseSchema.safeParse({ ...base, payment: { mode: "part", amountPaisa: 0 } }).success,
    ).toBe(false);
    expect(
      purchaseSchema.safeParse({
        ...base,
        payment: { mode: "full", amountPaisa: 0, method: "gold" },
      }).success,
    ).toBe(false);
    const ok = purchaseSchema.safeParse({ ...base, payment: { mode: "part", amountPaisa: 50 } });
    expect(ok.success && ok.data.payment).toEqual({ mode: "part", amountPaisa: 50, method: "cash" });
  });
});

describe("Payables agrees with the supplier ledger", () => {
  it("for every supplier, including returns and payments made later", async () => {
    const { recordSupplierPayment } = await import("@/lib/repos/suppliers");
    await recordSupplierPayment({
      supplierId: "s1", dateAd: DATE_AD, dateBs: DATE_BS, amountPaisa: 1234,
      method: "cash", note: "", userId: USER,
    });
    await q(
      `INSERT INTO purchase_returns (id, supplier_id, date_ad, date_bs, total_paisa, created_at)
       VALUES ('ret1', 's1', ?, ?, 999, 't')`,
      [DATE_AD, DATE_BS],
    );
    for (const s of ["s1", "s2", "s3"]) {
      expect(await payablesOwed(s)).toBe(await ledgerBalance(s));
    }
  });

  it("lists who is owed first, largest first", async () => {
    const { supplierPayables } = await import("@/lib/repos/payables");
    const rows = await supplierPayables();
    expect(rows[0]!.id).toBe("s1");
    expect(rows.find((r) => r.id === "s3")!.owedPaisa).toBe(0);
  });
});

describe("undoing a supplier payment", () => {
  it("puts the amount back on what is owed, keeps the row, and records who and why", async () => {
    const res = await newPurchase("s2", { mode: "full", amountPaisa: 0, method: "cash" });
    const before = await ledgerBalance("s2");
    const [pay] = await q<{ id: string }>(
      "SELECT id FROM supplier_payments WHERE purchase_id = ?",
      [res.id],
    );
    const { voidPayment } = await import("@/lib/repos/payables");
    const out = await voidPayment({
      kind: "supplier", paymentId: pay!.id, reason: "typed on the wrong bill", userId: USER,
    });
    expect(out).toEqual({ partyId: "s2", amountPaisa: 20000, purchaseId: res.id });
    expect(await ledgerBalance("s2")).toBe(before + 20000);
    expect(await payablesOwed("s2")).toBe(before + 20000);

    const [row] = await q<Record<string, unknown>>("SELECT * FROM supplier_payments WHERE id = ?", [pay!.id]);
    expect(row!.voided_at).not.toBeNull();
    expect(row!.voided_by).toBe(USER);
    expect(row!.void_reason).toBe("typed on the wrong bill");
    expect(Number(row!.amount_paisa)).toBe(20000);

    const audit = await q<{ detail_json: string }>(
      "SELECT detail_json FROM audit_log WHERE action = 'supplier.payment_voided'",
    );
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0]!.detail_json)).toMatchObject({
      paymentId: pay!.id, amountPaisa: 20000, reason: "typed on the wrong bill",
    });

    const { getPurchase } = await import("@/lib/repos/purchases");
    expect((await getPurchase(res.id))!.payments[0]!.voided).toBe(true);
  });

  it("refuses twice, without a reason, or for a payment that is not there — changing nothing", async () => {
    const { voidPayment, PaymentError } = await import("@/lib/repos/payables");
    const [voided] = await q<{ id: string }>(
      "SELECT id FROM supplier_payments WHERE voided_at IS NOT NULL LIMIT 1",
    );
    const [live] = await q<{ id: string }>(
      "SELECT id FROM supplier_payments WHERE voided_at IS NULL LIMIT 1",
    );
    const snap = await snapshot();
    await expect(
      voidPayment({ kind: "supplier", paymentId: voided!.id, reason: "again", userId: USER }),
    ).rejects.toBeInstanceOf(PaymentError);
    await expect(
      voidPayment({ kind: "supplier", paymentId: live!.id, reason: "   ", userId: USER }),
    ).rejects.toBeInstanceOf(PaymentError);
    await expect(
      voidPayment({ kind: "supplier", paymentId: "nope", reason: "x", userId: USER }),
    ).rejects.toBeInstanceOf(PaymentError);
    // A laboratory payment id is not a supplier payment.
    await expect(
      voidPayment({ kind: "lab", paymentId: live!.id, reason: "x", userId: USER }),
    ).rejects.toBeInstanceOf(PaymentError);
    expect(await snapshot()).toBe(snap);
  });

  it("refuses a payment dated in a closed year", async () => {
    await q(
      `INSERT INTO supplier_payments (id, supplier_id, date_ad, date_bs, amount_paisa, method, note, user_id, created_at)
       VALUES ('old-pay', 's3', '2026-01-15', '2082-10-01', 5000, 'cash', '', 'u1', 't0')`,
    );
    const { voidPayment, PaymentError } = await import("@/lib/repos/payables");
    const snap = await snapshot();
    await expect(
      voidPayment({ kind: "supplier", paymentId: "old-pay", reason: "x", userId: USER }),
    ).rejects.toBeInstanceOf(PaymentError);
    expect(await snapshot()).toBe(snap);
  });
});

describe("changing the supplier on a purchase", () => {
  it("takes the payment made with it along to the new supplier", async () => {
    const res = await newPurchase("s1", { mode: "part", amountPaisa: 6000, method: "cash" });
    const s1Before = await ledgerBalance("s1");
    const s3Before = await ledgerBalance("s3");

    const { getPurchase, updatePurchase } = await import("@/lib/repos/purchases");
    const p = await getPurchase(res.id);
    await updatePurchase({
      purchaseId: res.id,
      supplierId: "s3",
      supplierInvoiceNo: "SB-1",
      dateAd: DATE_AD,
      dateBs: DATE_BS,
      vatPaisa: 0,
      billDiscountPaisa: 0,
      roundingPaisa: 0,
      userId: USER,
      lines: [{ ...line(), lineId: p!.lines[0]!.lineId }],
    });

    const [pay] = await q<{ supplier_id: string }>(
      "SELECT supplier_id FROM supplier_payments WHERE purchase_id = ?",
      [res.id],
    );
    expect(pay!.supplier_id).toBe("s3");
    // The whole bill, and what was paid on it, left s1 together.
    expect(await ledgerBalance("s1")).toBe(s1Before - (20000 - 6000));
    expect(await ledgerBalance("s3")).toBe(s3Before + (20000 - 6000));

    const [audit] = await q<{ detail_json: string }>(
      "SELECT detail_json FROM audit_log WHERE action = 'purchase_edit' ORDER BY at DESC, rowid DESC LIMIT 1",
    );
    expect(JSON.parse(audit!.detail_json).paymentsMovedToNewSupplier).toBe(1);
  });

  it("leaves payments where they are when the supplier does not change", async () => {
    const res = await newPurchase("s2", { mode: "part", amountPaisa: 100, method: "cash" });
    const { getPurchase, updatePurchase } = await import("@/lib/repos/purchases");
    const p = await getPurchase(res.id);
    await updatePurchase({
      purchaseId: res.id,
      supplierId: "s2",
      supplierInvoiceNo: "SB-1 fixed",
      dateAd: DATE_AD,
      dateBs: DATE_BS,
      vatPaisa: 0,
      billDiscountPaisa: 0,
      roundingPaisa: 0,
      userId: USER,
      lines: [{ ...line(), lineId: p!.lines[0]!.lineId }],
    });
    const [pay] = await q<{ supplier_id: string }>(
      "SELECT supplier_id FROM supplier_payments WHERE purchase_id = ?",
      [res.id],
    );
    expect(pay!.supplier_id).toBe("s2");
    const [audit] = await q<{ detail_json: string }>(
      "SELECT detail_json FROM audit_log WHERE action = 'purchase_edit' ORDER BY at DESC, rowid DESC LIMIT 1",
    );
    expect(JSON.parse(audit!.detail_json).paymentsMovedToNewSupplier).toBeUndefined();
  });
});

describe("laboratory payments", () => {
  it("an undone payment drops out of every laboratory figure", async () => {
    const { recordPartnerPayment, partnerSummary, partnerStatement } = await import(
      "@/lib/repos/clinic-reports"
    );
    const { partnerBalancePaisa } = await import("@/lib/repos/lab-partners");
    const { labPayables, voidPayment } = await import("@/lib/repos/payables");
    const range = { fromIso: "2026-07-17", toIso: "2027-07-16" };

    const keep = await recordPartnerPayment({
      partnerId: "lab1", dateAd: DATE_AD, dateBs: DATE_BS, amountPaisa: 300,
      method: "cash", note: "", userId: USER,
    });
    const wrong = await recordPartnerPayment({
      partnerId: "lab1", dateAd: DATE_AD, dateBs: DATE_BS, amountPaisa: 5000,
      method: "bank", note: "", userId: USER,
    });
    expect(await partnerBalancePaisa("lab1")).toBe(-5300);

    await voidPayment({ kind: "lab", paymentId: wrong, reason: "double entry", userId: USER });

    expect(await partnerBalancePaisa("lab1")).toBe(-300);
    const summary = (await partnerSummary(range)).find((r) => r.partnerId === "lab1")!;
    expect(summary.paymentsPaisa).toBe(300);
    expect(summary.balancePaisa).toBe(-300);
    const statement = (await partnerStatement("lab1", range))!;
    expect(statement.paymentsPaisa).toBe(300);
    expect(statement.entries).toHaveLength(1);
    // Opening balance for a later period also ignores it.
    const later = (await partnerStatement("lab1", { fromIso: "2026-12-01", toIso: "2026-12-31" }))!;
    expect(later.openingPaisa).toBe(-300);
    expect((await labPayables()).find((r) => r.id === "lab1")!.owedPaisa).toBe(-300);

    const audit = await q("SELECT id FROM audit_log WHERE action = 'lab_partner.payment_voided'");
    expect(audit).toHaveLength(1);
    expect(keep).toBeTruthy();
  });
});

describe("the list of payments made", () => {
  it("shows both kinds, newest first, marks undone ones, and knows a closed year", async () => {
    const { recentPayments } = await import("@/lib/repos/payables");
    const all = await recentPayments({ suppliers: true, labs: true });
    expect(all.some((p) => p.kind === "lab")).toBe(true);
    expect(all.some((p) => p.kind === "supplier" && p.purchaseNo)).toBe(true);
    expect(all.some((p) => p.voided && p.voidReason === "double entry")).toBe(true);
    const old = all.find((p) => p.id === "old-pay")!;
    expect(old.yearOpen).toBe(false);
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1]!.createdAt >= all[i]!.createdAt).toBe(true);
    }

    const onlySuppliers = await recentPayments({ suppliers: true, labs: false });
    expect(onlySuppliers.every((p) => p.kind === "supplier")).toBe(true);
    expect(await recentPayments({ suppliers: false, labs: false })).toEqual([]);
  });
});
