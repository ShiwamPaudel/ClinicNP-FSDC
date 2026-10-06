/**
 * clinic-reports.ts — the answers the owner and the accountant want from the
 * clinic side of the business.
 *
 * Every figure here reads the snapshots on `bill_service_lines`, never the
 * current catalog: what a doctor earned in Ashar is what the terms were in
 * Ashar, whatever they are today. Refunds are netted out, and cancelled bills
 * are excluded everywhere.
 *
 * Every function takes an AD date range, matching every other report in the
 * product. The range picker and the fiscal-year selector both produce AD
 * bounds, and having one date basis for all filtering is what keeps a clinic
 * report and a pharmacy report over the same period agree with each other.
 * BS dates are still what people see; they are just not what is compared.
 */
import "server-only";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";

export interface AdRange {
  fromIso: string;
  toIso: string;
}

/**
 * Refunds are netted per service line. A line refunded in full contributes
 * nothing; one refunded in part contributes the rest.
 */
const NET_AMOUNT = `
  (sl.amount_paisa - COALESCE((
     SELECT SUM(r.amount_paisa) FROM sale_return_service_lines r
      WHERE r.bill_service_line_id = sl.id), 0))`;

const NET_QTY = `
  (sl.qty - COALESCE((
     SELECT SUM(r.qty) FROM sale_return_service_lines r
      WHERE r.bill_service_line_id = sl.id), 0))`;

// ---------------------------------------------------------------------------
// Service revenue
// ---------------------------------------------------------------------------

export interface ServiceRevenueRow {
  serviceId: string;
  name: string;
  groupName: string;
  count: number;
  grossPaisa: number;
  refundedPaisa: number;
  netPaisa: number;
  partnerCostPaisa: number;
  marginPaisa: number;
}

export async function serviceRevenue(range: AdRange): Promise<ServiceRevenueRow[]> {
  const res = await db().execute({
    sql: `SELECT sl.service_id,
                 sl.name_snapshot AS name,
                 g.name AS group_name,
                 SUM(${NET_QTY}) AS qty,
                 SUM(sl.amount_paisa) AS gross,
                 SUM(sl.amount_paisa - ${NET_AMOUNT}) AS refunded,
                 SUM(${NET_AMOUNT}) AS net,
                 SUM(sl.partner_cost_paisa * ${NET_QTY}) AS partner_cost
            FROM bill_service_lines sl
            JOIN bills b ON b.id = sl.bill_id
            LEFT JOIN services s ON s.id = sl.service_id
            LEFT JOIN service_groups g ON g.id = s.group_id
           WHERE b.status = 'saved' AND b.date_ad BETWEEN ? AND ?
           GROUP BY sl.service_id, sl.name_snapshot
           ORDER BY net DESC`,
    args: [range.fromIso, range.toIso],
  });
  return res.rows.map((r: Row) => {
    const net = Number(r.net);
    const partnerCost = Number(r.partner_cost);
    return {
      serviceId: r.service_id as string,
      name: r.name as string,
      groupName: (r.group_name as string | null) ?? "—",
      count: Number(r.qty),
      grossPaisa: Number(r.gross),
      refundedPaisa: Number(r.refunded),
      netPaisa: net,
      partnerCostPaisa: partnerCost,
      marginPaisa: net - partnerCost,
    };
  });
}

// ---------------------------------------------------------------------------
// Doctor payouts
// ---------------------------------------------------------------------------

export interface DoctorPayoutRow {
  doctorId: string;
  name: string;
  /** how the share was worked out, as snapshotted on the lines */
  basisSummary: string;
  consultations: number;
  otherServices: number;
  billedPaisa: number;
  sharePaisa: number;
}

/**
 * What each doctor earned in the range.
 *
 * The share comes from `doctor_share_paisa`, computed and frozen at billing
 * time. Editing a doctor's terms today cannot move a rupee of this. A line
 * refunded in full takes its share back with it.
 */
export async function doctorPayouts(range: AdRange): Promise<DoctorPayoutRow[]> {
  const res = await db().execute({
    sql: `SELECT sl.doctor_id,
                 d.name,
                 SUM(CASE WHEN g.is_consultation = 1 THEN ${NET_QTY} ELSE 0 END) AS consults,
                 SUM(CASE WHEN COALESCE(g.is_consultation, 0) = 0 THEN ${NET_QTY} ELSE 0 END) AS others,
                 SUM(${NET_AMOUNT}) AS billed,
                 -- the frozen share, scaled down by whatever was refunded
                 SUM(CASE WHEN sl.amount_paisa > 0
                          THEN sl.doctor_share_paisa * ${NET_AMOUNT} / sl.amount_paisa
                          ELSE sl.doctor_share_paisa END) AS share,
                 GROUP_CONCAT(DISTINCT sl.doctor_share_basis) AS bases
            FROM bill_service_lines sl
            JOIN bills b ON b.id = sl.bill_id
            LEFT JOIN doctors d ON d.id = sl.doctor_id
            LEFT JOIN services s ON s.id = sl.service_id
            LEFT JOIN service_groups g ON g.id = s.group_id
           WHERE b.status = 'saved'
             AND sl.doctor_id IS NOT NULL
             AND b.date_ad BETWEEN ? AND ?
           GROUP BY sl.doctor_id
           ORDER BY share DESC`,
    args: [range.fromIso, range.toIso],
  });

  const BASIS_WORDS: Record<string, string> = {
    none: "no share",
    pct_consult: "a percentage of consultations",
    fixed_consult: "a fixed amount per consultation",
    pct_services: "a percentage of all services",
  };

  return res.rows.map((r: Row) => ({
    doctorId: r.doctor_id as string,
    name: (r.name as string | null) ?? "A doctor who is no longer listed",
    basisSummary: String(r.bases ?? "")
      .split(",")
      .filter(Boolean)
      .map((b) => BASIS_WORDS[b] ?? b)
      .join(" and "),
    consultations: Number(r.consults),
    otherServices: Number(r.others),
    billedPaisa: Number(r.billed),
    sharePaisa: Math.floor(Number(r.share)),
  }));
}

// ---------------------------------------------------------------------------
// Laboratory partner ledger
// ---------------------------------------------------------------------------

export interface PartnerLedgerEntry {
  dateBs: string;
  dateAd: string;
  kind: "test" | "payment";
  description: string;
  /** what the clinic owes for a test sent */
  chargePaisa: number;
  /** what the clinic paid */
  paymentPaisa: number;
  runningPaisa: number;
}

export interface PartnerStatement {
  partnerId: string;
  partnerName: string;
  openingPaisa: number;
  testsPaisa: number;
  paymentsPaisa: number;
  closingPaisa: number;
  billedPaisa: number;
  marginPaisa: number;
  entries: PartnerLedgerEntry[];
}

/** Everything owed to one laboratory before a date — the opening balance. */
async function openingBalance(partnerId: string, fromIso: string): Promise<number> {
  const sent = await db().execute({
    sql: `SELECT COALESCE(SUM(sl.partner_cost_paisa * ${NET_QTY}), 0) AS n
            FROM bill_service_lines sl
            JOIN bills b ON b.id = sl.bill_id
           WHERE sl.lab_partner_id = ? AND b.status = 'saved' AND b.date_ad < ?`,
    args: [partnerId, fromIso],
  });
  const paid = await db().execute({
    sql: `SELECT COALESCE(SUM(amount_paisa), 0) AS n
            FROM lab_partner_payments
           WHERE lab_partner_id = ? AND date_ad < ? AND voided_at IS NULL`,
    args: [partnerId, fromIso],
  });
  return Number(sent.rows[0]!.n) - Number(paid.rows[0]!.n);
}

export async function partnerStatement(
  partnerId: string,
  range: AdRange,
): Promise<PartnerStatement | null> {
  const p = await db().execute({
    sql: "SELECT id, name FROM lab_partners WHERE id = ?",
    args: [partnerId],
  });
  if (!p.rows[0]) return null;

  const opening = await openingBalance(partnerId, range.fromIso);

  const tests = await db().execute({
    sql: `SELECT b.date_bs, b.date_ad, sl.name_snapshot AS name,
                 ${NET_QTY} AS qty,
                 sl.partner_cost_paisa * ${NET_QTY} AS cost,
                 ${NET_AMOUNT} AS billed
            FROM bill_service_lines sl
            JOIN bills b ON b.id = sl.bill_id
           WHERE sl.lab_partner_id = ? AND b.status = 'saved'
             AND b.date_ad BETWEEN ? AND ?
           ORDER BY b.date_ad ASC, b.rowid ASC`,
    args: [partnerId, range.fromIso, range.toIso],
  });

  const payments = await db().execute({
    sql: `SELECT date_bs, date_ad, amount_paisa, method, note
            FROM lab_partner_payments
           WHERE lab_partner_id = ? AND date_ad BETWEEN ? AND ?
             AND voided_at IS NULL
           ORDER BY date_ad ASC, rowid ASC`,
    args: [partnerId, range.fromIso, range.toIso],
  });

  type Raw = {
    dateBs: string;
    dateAd: string;
    kind: "test" | "payment";
    description: string;
    chargePaisa: number;
    paymentPaisa: number;
  };

  const raw: Raw[] = [
    ...tests.rows.map((r: Row) => ({
      dateBs: r.date_bs as string,
      dateAd: r.date_ad as string,
      kind: "test" as const,
      description:
        Number(r.qty) > 1 ? `${r.name} × ${Number(r.qty)}` : (r.name as string),
      chargePaisa: Number(r.cost),
      paymentPaisa: 0,
    })),
    ...payments.rows.map((r: Row) => ({
      dateBs: r.date_bs as string,
      dateAd: r.date_ad as string,
      kind: "payment" as const,
      description: `Paid — ${r.method}${r.note ? ` · ${r.note}` : ""}`,
      chargePaisa: 0,
      paymentPaisa: Number(r.amount_paisa),
    })),
  ].sort((a, b) => a.dateAd.localeCompare(b.dateAd));

  let running = opening;
  const entries: PartnerLedgerEntry[] = raw.map((e) => {
    running += e.chargePaisa - e.paymentPaisa;
    return { ...e, runningPaisa: running };
  });

  const testsPaisa = tests.rows.reduce((s, r) => s + Number(r.cost), 0);
  const billedPaisa = tests.rows.reduce((s, r) => s + Number(r.billed), 0);
  const paymentsPaisa = payments.rows.reduce(
    (s, r) => s + Number(r.amount_paisa),
    0,
  );

  return {
    partnerId,
    partnerName: p.rows[0].name as string,
    openingPaisa: opening,
    testsPaisa,
    paymentsPaisa,
    closingPaisa: opening + testsPaisa - paymentsPaisa,
    billedPaisa,
    marginPaisa: billedPaisa - testsPaisa,
    entries,
  };
}

export interface PartnerSummaryRow {
  partnerId: string;
  name: string;
  testsPaisa: number;
  billedPaisa: number;
  marginPaisa: number;
  paymentsPaisa: number;
  balancePaisa: number;
}

/** Every laboratory on one screen. */
export async function partnerSummary(range: AdRange): Promise<PartnerSummaryRow[]> {
  const res = await db().execute({
    sql: `SELECT p.id, p.name,
                 COALESCE((SELECT SUM(sl.partner_cost_paisa * ${NET_QTY})
                             FROM bill_service_lines sl
                             JOIN bills b ON b.id = sl.bill_id
                            WHERE sl.lab_partner_id = p.id AND b.status = 'saved'
                              AND b.date_ad BETWEEN ? AND ?), 0) AS tests,
                 COALESCE((SELECT SUM(${NET_AMOUNT})
                             FROM bill_service_lines sl
                             JOIN bills b ON b.id = sl.bill_id
                            WHERE sl.lab_partner_id = p.id AND b.status = 'saved'
                              AND b.date_ad BETWEEN ? AND ?), 0) AS billed,
                 COALESCE((SELECT SUM(amount_paisa) FROM lab_partner_payments lp
                            WHERE lp.lab_partner_id = p.id AND lp.voided_at IS NULL
                              AND lp.date_ad BETWEEN ? AND ?), 0) AS payments,
                 COALESCE((SELECT SUM(sl.partner_cost_paisa * ${NET_QTY})
                             FROM bill_service_lines sl
                             JOIN bills b ON b.id = sl.bill_id
                            WHERE sl.lab_partner_id = p.id AND b.status = 'saved'), 0)
                 - COALESCE((SELECT SUM(amount_paisa) FROM lab_partner_payments lp
                              WHERE lp.lab_partner_id = p.id AND lp.voided_at IS NULL), 0) AS balance
            FROM lab_partners p
           ORDER BY p.name ASC`,
    args: [
      range.fromIso, range.toIso,
      range.fromIso, range.toIso,
      range.fromIso, range.toIso,
    ],
  });
  return res.rows.map((r: Row) => ({
    partnerId: r.id as string,
    name: r.name as string,
    testsPaisa: Number(r.tests),
    billedPaisa: Number(r.billed),
    marginPaisa: Number(r.billed) - Number(r.tests),
    paymentsPaisa: Number(r.payments),
    balancePaisa: Number(r.balance),
  }));
}

export async function recordPartnerPayment(input: {
  partnerId: string;
  dateAd: string;
  dateBs: string;
  amountPaisa: number;
  method: string;
  note: string;
  userId: string;
}): Promise<string> {
  const { ulid } = await import("ulid");
  const id = ulid();
  await db().execute({
    sql: `INSERT INTO lab_partner_payments
            (id, lab_partner_id, date_ad, date_bs, amount_paisa, method, note, user_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.partnerId,
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

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

export interface VisitRegisterRow {
  visitId: string;
  dateBs: string;
  visitNo: number | null;
  fiscalLabel: string;
  patientNo: number | null;
  patientName: string;
  sex: string;
  type: string;
  department: string;
  doctorName: string;
  status: string;
}

export async function patientVisitRegister(
  range: AdRange,
): Promise<VisitRegisterRow[]> {
  const res = await db().execute({
    sql: `SELECT v.id, v.date_bs, v.visit_no, v.type, v.department, v.status,
                 f.bs_label, p.patient_no, p.name, p.sex, d.name AS doctor_name
            FROM visits v
            JOIN patients p ON p.id = v.patient_id
            LEFT JOIN fiscal_years f ON f.id = v.fiscal_year_id
            LEFT JOIN doctors d ON d.id = v.doctor_id
           WHERE v.date_ad BETWEEN ? AND ?
           ORDER BY v.date_ad DESC, v.visit_no DESC`,
    args: [range.fromIso, range.toIso],
  });
  return res.rows.map((r: Row) => ({
    visitId: r.id as string,
    dateBs: r.date_bs as string,
    visitNo: r.visit_no == null ? null : Number(r.visit_no),
    fiscalLabel: (r.bs_label as string | null) ?? "",
    patientNo: r.patient_no == null ? null : Number(r.patient_no),
    patientName: r.name as string,
    sex: r.sex as string,
    type: r.type as string,
    department: (r.department as string) ?? "",
    doctorName: (r.doctor_name as string | null) ?? "",
    status: r.status as string,
  }));
}

export interface NewVsReturning {
  newPatients: number;
  returningPatients: number;
  totalVisits: number;
}

/**
 * "New" means this was the patient's first ever visit, not their first in the
 * range — a patient who first came two years ago is a returning patient even
 * when the range starts today.
 */
export async function newVsReturning(range: AdRange): Promise<NewVsReturning> {
  const res = await db().execute({
    sql: `SELECT
            COUNT(*) AS visits,
            SUM(CASE WHEN v.id = (SELECT v2.id FROM visits v2
                                   WHERE v2.patient_id = v.patient_id
                                     AND v2.status != 'cancelled'
                                   ORDER BY v2.date_ad ASC, v2.rowid ASC
                                   LIMIT 1)
                     THEN 1 ELSE 0 END) AS first_visits
          FROM visits v
          WHERE v.status != 'cancelled' AND v.date_ad BETWEEN ? AND ?`,
    args: [range.fromIso, range.toIso],
  });
  const r = res.rows[0]!;
  const visits = Number(r.visits);
  const fresh = Number(r.first_visits ?? 0);
  return {
    newPatients: fresh,
    returningPatients: visits - fresh,
    totalVisits: visits,
  };
}

// ---------------------------------------------------------------------------
// Diagnostics utilisation and files pending
// ---------------------------------------------------------------------------

export interface UtilisationRow {
  groupName: string;
  count: number;
  netPaisa: number;
}

export async function diagnosticsUtilisation(
  range: AdRange,
): Promise<UtilisationRow[]> {
  const res = await db().execute({
    sql: `SELECT COALESCE(g.name, 'Other') AS group_name,
                 SUM(${NET_QTY}) AS qty,
                 SUM(${NET_AMOUNT}) AS net
            FROM bill_service_lines sl
            JOIN bills b ON b.id = sl.bill_id
            LEFT JOIN services s ON s.id = sl.service_id
            LEFT JOIN service_groups g ON g.id = s.group_id
           WHERE b.status = 'saved' AND b.date_ad BETWEEN ? AND ?
           GROUP BY group_name
           ORDER BY net DESC`,
    args: [range.fromIso, range.toIso],
  });
  return res.rows.map((r: Row) => ({
    groupName: r.group_name as string,
    count: Number(r.qty),
    netPaisa: Number(r.net),
  }));
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface ClinicToday {
  /** collection split four ways, net of refunds */
  medicinesPaisa: number;
  consultationPaisa: number;
  diagnosticsPaisa: number;
  laboratoryPaisa: number;
  patientsSeen: number;
  newRegistrations: number;
  samplesToCollect: number;
}

/**
 * The clinic half of the dashboard, for one day.
 *
 * The split is four ways because that is how the owner thinks about the day:
 * what came from the shelf, what came from the doctor's time, what came from
 * the machines, and what came from tests. "Laboratory" is anything sent to an
 * outside partner; "diagnostics" is everything else that is not a consultation.
 */
export async function clinicToday(dayIso: string): Promise<ClinicToday> {
  const svc = await db().execute({
    sql: `SELECT
            SUM(CASE WHEN g.is_consultation = 1 THEN ${NET_AMOUNT} ELSE 0 END) AS consult,
            SUM(CASE WHEN sl.lab_partner_id IS NOT NULL THEN ${NET_AMOUNT} ELSE 0 END) AS lab,
            SUM(CASE WHEN COALESCE(g.is_consultation, 0) = 0
                      AND sl.lab_partner_id IS NULL THEN ${NET_AMOUNT} ELSE 0 END) AS diag
          FROM bill_service_lines sl
          JOIN bills b ON b.id = sl.bill_id
          LEFT JOIN services s ON s.id = sl.service_id
          LEFT JOIN service_groups g ON g.id = s.group_id
          WHERE b.status = 'saved' AND b.date_ad = ?`,
    args: [dayIso],
  });

  const med = await db().execute({
    sql: `SELECT COALESCE(SUM(
                   bl.amount_paisa - COALESCE((
                     SELECT SUM(r.amount_paisa) FROM sale_return_lines r
                      WHERE r.bill_line_id = bl.id), 0)), 0) AS n
            FROM bill_lines bl
            JOIN bills b ON b.id = bl.bill_id
           WHERE b.status = 'saved' AND b.date_ad = ?`,
    args: [dayIso],
  });

  const seen = await db().execute({
    sql: `SELECT COUNT(DISTINCT patient_id) AS n FROM visits
           WHERE date_ad = ? AND status != 'cancelled'`,
    args: [dayIso],
  });

  const registered = await db().execute({
    sql: "SELECT COUNT(*) AS n FROM patients WHERE substr(created_at, 1, 10) = ?",
    args: [dayIso],
  });

  // Samples billed and not yet drawn. Counted across all days on purpose: a
  // sample nobody collected on Sunday is still uncollected on Monday, and a
  // number that resets overnight would say the work had gone away.
  const pending = await db().execute({
    sql: `SELECT COUNT(*) AS n
            FROM bill_service_lines sl
            JOIN bills b ON b.id = sl.bill_id
            JOIN services s ON s.id = sl.service_id
           WHERE b.status = 'saved' AND s.outsourced = 1
             AND sl.collected_at IS NULL`,
    args: [],
  });

  const r = svc.rows[0]!;
  return {
    medicinesPaisa: Number(med.rows[0]!.n),
    consultationPaisa: Number(r.consult ?? 0),
    diagnosticsPaisa: Number(r.diag ?? 0),
    laboratoryPaisa: Number(r.lab ?? 0),
    patientsSeen: Number(seen.rows[0]!.n),
    newRegistrations: Number(registered.rows[0]!.n),
    samplesToCollect: Number(pending.rows[0]!.n),
  };
}

export interface TopServiceRow {
  name: string;
  count: number;
  netPaisa: number;
}

/** The busiest services this BS month, for the dashboard panel. */
export async function topServices(
  range: AdRange,
  limit = 5,
): Promise<TopServiceRow[]> {
  const res = await db().execute({
    sql: `SELECT sl.name_snapshot AS name,
                 SUM(${NET_QTY}) AS qty,
                 SUM(${NET_AMOUNT}) AS net
            FROM bill_service_lines sl
            JOIN bills b ON b.id = sl.bill_id
           WHERE b.status = 'saved' AND b.date_ad BETWEEN ? AND ?
           GROUP BY sl.name_snapshot
           ORDER BY qty DESC
           LIMIT ?`,
    args: [range.fromIso, range.toIso, limit],
  });
  return res.rows.map((r: Row) => ({
    name: r.name as string,
    count: Number(r.qty),
    netPaisa: Number(r.net),
  }));
}

/** Daily service takings, so the dashboard trend can show a navy series. */
export async function serviceTrend(
  fromIso: string,
  toIso: string,
): Promise<{ dateAd: string; netPaisa: number }[]> {
  const res = await db().execute({
    sql: `SELECT b.date_ad AS d, SUM(${NET_AMOUNT}) AS s
            FROM bill_service_lines sl
            JOIN bills b ON b.id = sl.bill_id
           WHERE b.status = 'saved' AND b.date_ad BETWEEN ? AND ?
           GROUP BY b.date_ad
           ORDER BY b.date_ad ASC`,
    args: [fromIso, toIso],
  });
  return res.rows.map((r: Row) => ({
    dateAd: r.d as string,
    netPaisa: Number(r.s),
  }));
}
