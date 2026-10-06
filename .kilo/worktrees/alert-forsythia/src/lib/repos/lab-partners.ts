/**
 * lab-partners.ts — outside laboratories, and the ledger that tracks what the
 * clinic owes each of them.
 *
 * The ledger is deliberately the same shape as the supplier ledger: tests sent
 * at partner cost on one side, payments on the other, running balance. The
 * money owed comes from `bill_service_lines.partner_cost_paisa`, snapshotted at
 * billing time, so re-pricing a test later never rewrites an old statement.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";

export interface LabPartner {
  id: string;
  name: string;
  panNo: string;
  phone: string;
  address: string;
  contactPerson: string;
  terms: string;
  active: boolean;
}

export interface LabPartnerInput {
  name: string;
  panNo: string;
  phone: string;
  address: string;
  contactPerson: string;
  terms: string;
  active: boolean;
}

function mapPartner(r: Row): LabPartner {
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

export async function listLabPartners(includeInactive = false): Promise<LabPartner[]> {
  const sql = includeInactive
    ? "SELECT * FROM lab_partners ORDER BY active DESC, name ASC"
    : "SELECT * FROM lab_partners WHERE active = 1 ORDER BY name ASC";
  const res = await db().execute(sql);
  return res.rows.map(mapPartner);
}

export async function getLabPartner(id: string): Promise<LabPartner | null> {
  const res = await db().execute({
    sql: "SELECT * FROM lab_partners WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? mapPartner(res.rows[0]) : null;
}

export async function createLabPartner(input: LabPartnerInput): Promise<string> {
  const id = ulid();
  const now = new Date().toISOString();
  await db().execute({
    sql: `INSERT INTO lab_partners
            (id, name, pan_no, phone, address, contact_person, terms, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.name,
      input.panNo,
      input.phone,
      input.address,
      input.contactPerson,
      input.terms,
      input.active ? 1 : 0,
      now,
      now,
    ],
  });
  return id;
}

export async function updateLabPartner(
  id: string,
  input: LabPartnerInput,
): Promise<void> {
  await db().execute({
    sql: `UPDATE lab_partners
             SET name = ?, pan_no = ?, phone = ?, address = ?, contact_person = ?,
                 terms = ?, active = ?, updated_at = ?
           WHERE id = ?`,
    args: [
      input.name,
      input.panNo,
      input.phone,
      input.address,
      input.contactPerson,
      input.terms,
      input.active ? 1 : 0,
      new Date().toISOString(),
      id,
    ],
  });
}

/** Outstanding balance with one partner: tests sent, less payments made. */
export async function partnerBalancePaisa(partnerId: string): Promise<number> {
  const sent = await db().execute({
    sql: `SELECT COALESCE(SUM(sl.partner_cost_paisa * sl.qty), 0) AS n
            FROM bill_service_lines sl
            JOIN bills b ON b.id = sl.bill_id
           WHERE sl.lab_partner_id = ? AND b.status = 'saved'`,
    args: [partnerId],
  });
  const paid = await db().execute({
    // A payment undone as a mistake (0023) no longer counts.
    sql: "SELECT COALESCE(SUM(amount_paisa), 0) AS n FROM lab_partner_payments WHERE lab_partner_id = ? AND voided_at IS NULL",
    args: [partnerId],
  });
  return Number(sent.rows[0]!.n) - Number(paid.rows[0]!.n);
}
