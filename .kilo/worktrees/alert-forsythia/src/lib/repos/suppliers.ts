/**
 * suppliers.ts — suppliers, payments, and the party ledger (running balance).
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";

export interface Supplier {
  id: string;
  name: string;
  panNo: string;
  phone: string;
  address: string;
  contactPerson: string;
  terms: string;
  active: boolean;
}

export interface SupplierInput {
  name: string;
  panNo: string;
  phone: string;
  address: string;
  contactPerson: string;
  terms: string;
  active: boolean;
}

function mapSupplier(r: Row): Supplier {
  return {
    id: r.id as string,
    name: r.name as string,
    panNo: r.pan_no as string,
    phone: r.phone as string,
    address: r.address as string,
    contactPerson: r.contact_person as string,
    terms: r.terms as string,
    active: Number(r.active) === 1,
  };
}

export async function listSuppliers(includeInactive = false): Promise<Supplier[]> {
  const sql = includeInactive
    ? "SELECT * FROM suppliers ORDER BY name ASC"
    : "SELECT * FROM suppliers WHERE active = 1 ORDER BY name ASC";
  const res = await db().execute(sql);
  return res.rows.map(mapSupplier);
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  const res = await db().execute({
    sql: "SELECT * FROM suppliers WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? mapSupplier(res.rows[0]) : null;
}

export async function createSupplier(input: SupplierInput): Promise<string> {
  const id = ulid();
  await db().execute({
    sql: `INSERT INTO suppliers
            (id, name, pan_no, phone, address, contact_person, terms, active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.name,
      input.panNo,
      input.phone,
      input.address,
      input.contactPerson,
      input.terms,
      input.active ? 1 : 0,
      new Date().toISOString(),
    ],
  });
  return id;
}

export async function updateSupplier(
  id: string,
  input: SupplierInput,
): Promise<void> {
  await db().execute({
    sql: `UPDATE suppliers SET
            name = ?, pan_no = ?, phone = ?, address = ?,
            contact_person = ?, terms = ?, active = ?
          WHERE id = ?`,
    args: [
      input.name,
      input.panNo,
      input.phone,
      input.address,
      input.contactPerson,
      input.terms,
      input.active ? 1 : 0,
      id,
    ],
  });
}

// ---- payments ----
export async function recordSupplierPayment(input: {
  supplierId: string;
  dateAd: string;
  dateBs: string;
  amountPaisa: number;
  method: string;
  note: string;
  userId: string;
}): Promise<string> {
  const id = ulid();
  await db().execute({
    sql: `INSERT INTO supplier_payments
            (id, supplier_id, date_ad, date_bs, amount_paisa, method, note, user_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.supplierId,
      input.dateAd,
      input.dateBs,
      input.amountPaisa,
      input.method,
      input.note,
      input.userId,
      new Date().toISOString(),
    ],
  });
  return id;
}

export interface LedgerEntry {
  dateBs: string;
  dateAd: string;
  kind: "purchase" | "purchase_return" | "payment";
  description: string;
  /** +increases what we owe (purchase); -reduces (return, payment) */
  deltaPaisa: number;
  balancePaisa: number;
}

/**
 * Party ledger: purchases increase the balance we owe; returns and payments reduce it.
 * Returns entries oldest-first with a running balance.
 */
export async function supplierLedger(supplierId: string): Promise<{
  entries: LedgerEntry[];
  balancePaisa: number;
}> {
  const rows: Omit<LedgerEntry, "balancePaisa">[] = [];

  const purchases = await db().execute({
    sql: `SELECT date_ad, date_bs, total_paisa, supplier_invoice_no
          FROM purchases WHERE supplier_id = ?`,
    args: [supplierId],
  });
  for (const p of purchases.rows) {
    rows.push({
      dateAd: p.date_ad as string,
      dateBs: p.date_bs as string,
      kind: "purchase",
      description: `Purchase ${p.supplier_invoice_no ? "#" + p.supplier_invoice_no : ""}`.trim(),
      deltaPaisa: Number(p.total_paisa),
    });
  }

  const returns = await db().execute({
    sql: `SELECT date_ad, date_bs, total_paisa, reason
          FROM purchase_returns WHERE supplier_id = ?`,
    args: [supplierId],
  });
  for (const r of returns.rows) {
    rows.push({
      dateAd: r.date_ad as string,
      dateBs: r.date_bs as string,
      kind: "purchase_return",
      description: `Return${r.reason ? " (" + r.reason + ")" : ""}`,
      deltaPaisa: -Number(r.total_paisa),
    });
  }

  // A payment undone as a mistake (0023) stays on file but no longer counts.
  const payments = await db().execute({
    sql: `SELECT date_ad, date_bs, amount_paisa, method
          FROM supplier_payments WHERE supplier_id = ? AND voided_at IS NULL`,
    args: [supplierId],
  });
  for (const p of payments.rows) {
    rows.push({
      dateAd: p.date_ad as string,
      dateBs: p.date_bs as string,
      kind: "payment",
      description: `Payment (${p.method})`,
      deltaPaisa: -Number(p.amount_paisa),
    });
  }

  rows.sort((a, b) => (a.dateAd < b.dateAd ? -1 : a.dateAd > b.dateAd ? 1 : 0));

  let balance = 0;
  const entries: LedgerEntry[] = rows.map((r) => {
    balance += r.deltaPaisa;
    return { ...r, balancePaisa: balance };
  });

  return { entries, balancePaisa: balance };
}

/** Just the outstanding balance (what the pharmacy owes the supplier). */
export async function supplierBalance(supplierId: string): Promise<number> {
  const { balancePaisa } = await supplierLedger(supplierId);
  return balancePaisa;
}
