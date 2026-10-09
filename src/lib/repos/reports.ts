/**
 * reports.ts — read-only aggregations for the dashboard and reports.
 * All amounts are integer paisa. Cancelled bills are excluded from sales;
 * sale returns are netted out so day-close / profit reconcile (PRD 4.4).
 */
import "server-only";
import { db } from "@/lib/db";
import { OWED_AT_SALE_SQL } from "@/lib/repos/dues";

const NOT_CANCELLED = "b.status = 'saved'";

// ---------- dashboard ----------

export interface DashboardMetrics {
  todaySalesPaisa: number;
  monthSalesPaisa: number;
  fySalesPaisa: number;
  billCountToday: number;
  topItems: { brandName: string; qty: number; revenuePaisa: number }[];
  trend: { dateAd: string; netPaisa: number }[];
}

async function netSalesBetween(fromIso: string, toIso: string): Promise<number> {
  const sales = await db().execute({
    sql: `SELECT IFNULL(SUM(total_paisa),0) AS s FROM bills b
          WHERE ${NOT_CANCELLED} AND b.date_ad >= ? AND b.date_ad <= ?`,
    args: [fromIso, toIso],
  });
  const returns = await db().execute({
    sql: `SELECT IFNULL(SUM(total_paisa),0) AS s FROM sale_returns
          WHERE date_ad >= ? AND date_ad <= ?`,
    args: [fromIso, toIso],
  });
  return Number(sales.rows[0]!.s) - Number(returns.rows[0]!.s);
}

export async function dashboardMetrics(opts: {
  todayIso: string;
  monthFromIso: string;
  monthToIso: string;
  fyFromIso: string;
  fyToIso: string;
  trendFromIso: string;
}): Promise<DashboardMetrics> {
  const [today, month, fy] = await Promise.all([
    netSalesBetween(opts.todayIso, opts.todayIso),
    netSalesBetween(opts.monthFromIso, opts.monthToIso),
    netSalesBetween(opts.fyFromIso, opts.fyToIso),
  ]);

  const countRes = await db().execute({
    sql: `SELECT COUNT(*) AS n FROM bills b WHERE ${NOT_CANCELLED} AND b.date_ad = ?`,
    args: [opts.todayIso],
  });

  const top = await db().execute({
    sql: `SELECT i.brand_name, SUM(bl.qty) AS qty, SUM(bl.amount_paisa) AS revenue
          FROM bill_lines bl
          JOIN bills b ON b.id = bl.bill_id
          JOIN items i ON i.id = bl.item_id
          WHERE ${NOT_CANCELLED} AND b.date_ad >= ? AND b.date_ad <= ?
          GROUP BY bl.item_id ORDER BY qty DESC LIMIT 5`,
    args: [opts.monthFromIso, opts.monthToIso],
  });

  const trendRes = await db().execute({
    sql: `SELECT b.date_ad AS d, IFNULL(SUM(b.total_paisa),0) AS s
          FROM bills b WHERE ${NOT_CANCELLED} AND b.date_ad >= ? AND b.date_ad <= ?
          GROUP BY b.date_ad ORDER BY b.date_ad ASC`,
    args: [opts.trendFromIso, opts.todayIso],
  });

  return {
    todaySalesPaisa: today,
    monthSalesPaisa: month,
    fySalesPaisa: fy,
    billCountToday: Number(countRes.rows[0]!.n),
    topItems: top.rows.map((r) => ({
      brandName: r.brand_name as string,
      qty: Number(r.qty),
      revenuePaisa: Number(r.revenue),
    })),
    trend: trendRes.rows.map((r) => ({
      dateAd: r.d as string,
      netPaisa: Number(r.s),
    })),
  };
}

// ---------- day close ----------

export interface DaySummary {
  billCount: number;
  grossSalesPaisa: number;
  billDiscountPaisa: number;
  returnsPaisa: number;
  netSalesPaisa: number;
  /**
   * How today's bills were paid for. `cash` and `qr` are money actually taken
   * at the counter — on a bill on dues, only the part paid then. `credit` is
   * what was left owing. The three add up to gross sales.
   */
  byMethod: { cash: number; qr: number; credit: number };
  /** money that came in today against dues from any day */
  duesReceived: { cash: number; qr: number };
  /** the part of today's returns that came off what somebody owed */
  returnsAgainstDuePaisa: number;
  expectedCashPaisa: number;
  /**
   * Where the day's takings came from, net of refunds. Present on every day
   * close; the clinic three are simply zero when there is no clinic.
   */
  split: {
    medicinesPaisa: number;
    consultationPaisa: number;
    diagnosticsPaisa: number;
    laboratoryPaisa: number;
  };
}

export async function daySummary(dayIso: string): Promise<DaySummary> {
  const agg = await db().execute({
    sql: `SELECT COUNT(*) AS n, IFNULL(SUM(total_paisa),0) AS gross,
                 IFNULL(SUM(discount_paisa),0) AS disc
          FROM bills b WHERE ${NOT_CANCELLED} AND b.date_ad = ?`,
    args: [dayIso],
  });
  // A bill on dues puts only its paid part in the drawer, in the way it was
  // paid; the rest is owed. Every bill lands wholly in the three columns, so
  // they still add up to gross sales.
  const method = await db().execute({
    sql: `SELECT
            IFNULL(SUM(CASE
              WHEN b.payment_method = 'cash' THEN b.total_paisa
              WHEN b.payment_method = 'credit'
               AND COALESCE(b.paid_now_method, 'cash') = 'cash'
                THEN b.total_paisa - ${OWED_AT_SALE_SQL}
              ELSE 0 END), 0) AS cash,
            IFNULL(SUM(CASE
              WHEN b.payment_method = 'qr' THEN b.total_paisa
              WHEN b.payment_method = 'credit' AND b.paid_now_method = 'qr'
                THEN b.total_paisa - ${OWED_AT_SALE_SQL}
              ELSE 0 END), 0) AS qr,
            IFNULL(SUM(${OWED_AT_SALE_SQL}), 0) AS on_dues
          FROM bills b WHERE ${NOT_CANCELLED} AND b.date_ad = ?`,
    args: [dayIso],
  });
  const returns = await db().execute({
    sql: `SELECT IFNULL(SUM(total_paisa),0) AS s,
                 IFNULL(SUM(against_due_paisa),0) AS against_due
            FROM sale_returns WHERE date_ad = ?`,
    args: [dayIso],
  });
  // Money received today against dues — from today's bills or anyone else's.
  // A cancelled bill takes its money out of the day, as it always has, and
  // that includes anything paid back against it.
  const received = await db().execute({
    sql: `SELECT dp.method, IFNULL(SUM(dp.amount_paisa),0) AS s
            FROM due_payments dp
            JOIN bills b ON b.id = dp.bill_id
           WHERE dp.date_ad = ? AND dp.voided_at IS NULL AND ${NOT_CANCELLED}
           GROUP BY dp.method`,
    args: [dayIso],
  });

  const m0 = method.rows[0]!;
  const byMethod = {
    cash: Number(m0.cash),
    qr: Number(m0.qr),
    credit: Number(m0.on_dues),
  };
  const duesReceived = { cash: 0, qr: 0 };
  for (const r of received.rows) {
    if (r.method === "qr") duesReceived.qr += Number(r.s);
    else duesReceived.cash += Number(r.s);
  }
  const gross = Number(agg.rows[0]!.gross);
  const ret = Number(returns.rows[0]!.s);
  const retAgainstDue = Number(returns.rows[0]!.against_due);

  // The four-way split. Medicines net their own returns; each clinic group
  // nets its own refunds, so the four add up to the net sales figure above.
  const splitRes = await db().execute({
    sql: `SELECT
            (SELECT IFNULL(SUM(bl.amount_paisa), 0)
               FROM bill_lines bl JOIN bills b ON b.id = bl.bill_id
              WHERE ${NOT_CANCELLED} AND b.date_ad = ?)
            - (SELECT IFNULL(SUM(srl.amount_paisa), 0)
                 FROM sale_return_lines srl
                 JOIN sale_returns sr ON sr.id = srl.sale_return_id
                WHERE sr.date_ad = ?) AS medicines,
            (SELECT IFNULL(SUM(sl.amount_paisa), 0)
               FROM bill_service_lines sl
               JOIN bills b ON b.id = sl.bill_id
               LEFT JOIN services sv ON sv.id = sl.service_id
               LEFT JOIN service_groups g ON g.id = sv.group_id
              WHERE ${NOT_CANCELLED} AND b.date_ad = ? AND g.is_consultation = 1) AS consult,
            (SELECT IFNULL(SUM(sl.amount_paisa), 0)
               FROM bill_service_lines sl
               JOIN bills b ON b.id = sl.bill_id
              WHERE ${NOT_CANCELLED} AND b.date_ad = ? AND sl.lab_partner_id IS NOT NULL) AS lab,
            (SELECT IFNULL(SUM(sl.amount_paisa), 0)
               FROM bill_service_lines sl
               JOIN bills b ON b.id = sl.bill_id
               LEFT JOIN services sv ON sv.id = sl.service_id
               LEFT JOIN service_groups g ON g.id = sv.group_id
              WHERE ${NOT_CANCELLED} AND b.date_ad = ?
                AND COALESCE(g.is_consultation, 0) = 0
                AND sl.lab_partner_id IS NULL) AS diag,
            (SELECT IFNULL(SUM(srsl.amount_paisa), 0)
               FROM sale_return_service_lines srsl
               JOIN sale_returns sr ON sr.id = srsl.sale_return_id
               JOIN bill_service_lines sl ON sl.id = srsl.bill_service_line_id
               LEFT JOIN services sv ON sv.id = sl.service_id
               LEFT JOIN service_groups g ON g.id = sv.group_id
              WHERE sr.date_ad = ? AND g.is_consultation = 1) AS consult_back,
            (SELECT IFNULL(SUM(srsl.amount_paisa), 0)
               FROM sale_return_service_lines srsl
               JOIN sale_returns sr ON sr.id = srsl.sale_return_id
               JOIN bill_service_lines sl ON sl.id = srsl.bill_service_line_id
              WHERE sr.date_ad = ? AND sl.lab_partner_id IS NOT NULL) AS lab_back,
            (SELECT IFNULL(SUM(srsl.amount_paisa), 0)
               FROM sale_return_service_lines srsl
               JOIN sale_returns sr ON sr.id = srsl.sale_return_id
               JOIN bill_service_lines sl ON sl.id = srsl.bill_service_line_id
               LEFT JOIN services sv ON sv.id = sl.service_id
               LEFT JOIN service_groups g ON g.id = sv.group_id
              WHERE sr.date_ad = ?
                AND COALESCE(g.is_consultation, 0) = 0
                AND sl.lab_partner_id IS NULL) AS diag_back`,
    args: [dayIso, dayIso, dayIso, dayIso, dayIso, dayIso, dayIso, dayIso],
  });
  const sp = splitRes.rows[0]!;

  return {
    split: {
      medicinesPaisa: Number(sp.medicines),
      consultationPaisa: Number(sp.consult) - Number(sp.consult_back),
      diagnosticsPaisa: Number(sp.diag) - Number(sp.diag_back),
      laboratoryPaisa: Number(sp.lab) - Number(sp.lab_back),
    },
    billCount: Number(agg.rows[0]!.n),
    grossSalesPaisa: gross,
    billDiscountPaisa: Number(agg.rows[0]!.disc),
    returnsPaisa: ret,
    netSalesPaisa: gross - ret,
    byMethod,
    duesReceived,
    returnsAgainstDuePaisa: retAgainstDue,
    // A return that only came off somebody's dues took no money out of the
    // drawer, so only the part handed back is taken off.
    expectedCashPaisa: byMethod.cash + duesReceived.cash - (ret - retAgainstDue),
  };
}

// ---------- sales register ----------

export interface SalesRegisterRow {
  invoiceNo: number | null;
  fiscalLabel: string;
  dateBs: string;
  patientName: string;
  subtotalPaisa: number;
  discountPaisa: number;
  vatPaisa: number;
  totalPaisa: number;
  paymentMethod: string;
  status: string;
  /**
   * The doctors' share of this bill as it was made — the frozen
   * `doctor_share_paisa` of its service lines (C-037). 0 where no doctor
   * on it has a share set.
   */
  doctorSharePaisa: number;
}

export async function salesRegister(
  fromIso: string,
  toIso: string,
): Promise<SalesRegisterRow[]> {
  const res = await db().execute({
    sql: `SELECT b.*, f.bs_label,
                 COALESCE((SELECT SUM(sl.doctor_share_paisa) FROM bill_service_lines sl
                            WHERE sl.bill_id = b.id), 0) AS doctor_share
          FROM bills b
          LEFT JOIN fiscal_years f ON f.id = b.fiscal_year_id
          WHERE b.date_ad >= ? AND b.date_ad <= ?
          ORDER BY b.invoice_no ASC`,
    args: [fromIso, toIso],
  });
  return res.rows.map((r) => ({
    invoiceNo: r.invoice_no != null ? Number(r.invoice_no) : null,
    fiscalLabel: (r.bs_label as string) ?? "",
    dateBs: r.date_bs as string,
    patientName: (r.patient_name as string) ?? "",
    subtotalPaisa: Number(r.subtotal_paisa),
    // Both discounts in one column: the register is a list of what was paid,
    // not a copy of each supplier's own totals block (0021).
    discountPaisa: Number(r.discount_paisa) + Number(r.bill_discount_paisa ?? 0),
    vatPaisa: Number(r.vat_paisa),
    totalPaisa: Number(r.total_paisa),
    paymentMethod: r.payment_method as string,
    status: r.status as string,
    doctorSharePaisa: Number(r.doctor_share ?? 0),
  }));
}

// ---------- purchase register ----------

export interface PurchaseRegisterRow {
  /** So the register can link to the entry itself. Not exported to the CSV,
   *  which maps its columns by name. */
  id: string;
  purchaseNo: string | null;
  supplierName: string;
  supplierInvoiceNo: string;
  dateBs: string;
  subtotalPaisa: number;
  discountPaisa: number;
  vatPaisa: number;
  totalPaisa: number;
}

export async function purchaseRegister(
  fromIso: string,
  toIso: string,
): Promise<PurchaseRegisterRow[]> {
  const res = await db().execute({
    sql: `SELECT p.*, s.name AS supplier_name FROM purchases p
          JOIN suppliers s ON s.id = p.supplier_id
          WHERE p.date_ad >= ? AND p.date_ad <= ?
          ORDER BY p.date_ad ASC`,
    args: [fromIso, toIso],
  });
  return res.rows.map((r) => ({
    id: r.id as string,
    purchaseNo: (r.purchase_no as string | null) ?? null,
    supplierName: r.supplier_name as string,
    supplierInvoiceNo: (r.supplier_invoice_no as string) ?? "",
    dateBs: r.date_bs as string,
    subtotalPaisa: Number(r.subtotal_paisa),
    discountPaisa: Number(r.discount_paisa),
    vatPaisa: Number(r.vat_paisa),
    totalPaisa: Number(r.total_paisa),
  }));
}

// ---------- profit (batch-accurate COGS, returns netted) ----------

export interface ProfitRow {
  brandName: string;
  qty: number;
  revenuePaisa: number;
  costPaisa: number;
  profitPaisa: number;
  marginPct: number;
}

export async function profitByItem(
  fromIso: string,
  toIso: string,
): Promise<{ rows: ProfitRow[]; totals: Omit<ProfitRow, "brandName" | "marginPct"> & { marginPct: number } }> {
  // revenue + qty from sold lines
  const rev = await db().execute({
    sql: `SELECT bl.item_id, i.brand_name,
                 SUM(bl.qty) AS qty, SUM(bl.amount_paisa) AS revenue
          FROM bill_lines bl JOIN bills b ON b.id = bl.bill_id
          JOIN items i ON i.id = bl.item_id
          WHERE ${NOT_CANCELLED} AND b.date_ad >= ? AND b.date_ad <= ?
          GROUP BY bl.item_id`,
    args: [fromIso, toIso],
  });
  // COGS from sale allocations at each batch's actual cost
  const cogs = await db().execute({
    sql: `SELECT bl.item_id, SUM(bb.base_qty * ba.purchase_cost_paisa_per_base) AS cost
          FROM bill_line_batches bb
          JOIN bill_lines bl ON bl.id = bb.bill_line_id
          JOIN bills b ON b.id = bl.bill_id
          JOIN batches ba ON ba.id = bb.batch_id
          WHERE ${NOT_CANCELLED} AND b.date_ad >= ? AND b.date_ad <= ?
          GROUP BY bl.item_id`,
    args: [fromIso, toIso],
  });
  // subtract returns (revenue + COGS)
  const retRev = await db().execute({
    sql: `SELECT bl.item_id, SUM(srl.amount_paisa) AS revenue,
                 SUM(srl.base_qty * ba.purchase_cost_paisa_per_base) AS cost
          FROM sale_return_lines srl
          JOIN sale_returns sr ON sr.id = srl.sale_return_id
          JOIN bill_lines bl ON bl.id = srl.bill_line_id
          JOIN batches ba ON ba.id = srl.batch_id
          WHERE sr.date_ad >= ? AND sr.date_ad <= ?
          GROUP BY bl.item_id`,
    args: [fromIso, toIso],
  });

  const costById = new Map<string, number>();
  for (const r of cogs.rows) costById.set(r.item_id as string, Number(r.cost));
  const retRevById = new Map<string, number>();
  const retCostById = new Map<string, number>();
  for (const r of retRev.rows) {
    retRevById.set(r.item_id as string, Number(r.revenue));
    retCostById.set(r.item_id as string, Number(r.cost ?? 0));
  }

  let tRev = 0,
    tCost = 0,
    tQty = 0;
  const rows: ProfitRow[] = rev.rows.map((r) => {
    const id = r.item_id as string;
    const revenue = Number(r.revenue) - (retRevById.get(id) ?? 0);
    const cost = (costById.get(id) ?? 0) - (retCostById.get(id) ?? 0);
    const qty = Number(r.qty);
    const profit = revenue - cost;
    tRev += revenue;
    tCost += cost;
    tQty += qty;
    return {
      brandName: r.brand_name as string,
      qty,
      revenuePaisa: revenue,
      costPaisa: cost,
      profitPaisa: profit,
      marginPct: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : 0,
    };
  });
  rows.sort((a, b) => b.profitPaisa - a.profitPaisa);

  return {
    rows,
    totals: {
      qty: tQty,
      revenuePaisa: tRev,
      costPaisa: tCost,
      profitPaisa: tRev - tCost,
      marginPct: tRev > 0 ? Math.round(((tRev - tCost) / tRev) * 1000) / 10 : 0,
    },
  };
}

// ---------- fast / slow moving ----------

export interface MovingRow {
  brandName: string;
  qtySold: number;
  valuePaisa: number;
  lastSoldAd: string | null;
  deadStock: boolean;
}

export async function movingItems(
  fromIso: string,
  toIso: string,
  todayIso: string,
): Promise<MovingRow[]> {
  const res = await db().execute({
    sql: `SELECT i.id, i.brand_name,
                 IFNULL(SUM(CASE WHEN b.date_ad >= ? AND b.date_ad <= ? AND ${NOT_CANCELLED}
                                 THEN bl.qty ELSE 0 END),0) AS qty,
                 IFNULL(SUM(CASE WHEN b.date_ad >= ? AND b.date_ad <= ? AND ${NOT_CANCELLED}
                                 THEN bl.amount_paisa ELSE 0 END),0) AS value,
                 MAX(CASE WHEN ${NOT_CANCELLED} THEN b.date_ad ELSE NULL END) AS last_sold
          FROM items i
          LEFT JOIN bill_lines bl ON bl.item_id = i.id
          LEFT JOIN bills b ON b.id = bl.bill_id
          WHERE i.active = 1
          GROUP BY i.id ORDER BY qty DESC`,
    args: [fromIso, toIso, fromIso, toIso],
  });
  const deadCutoff = new Date(Date.parse(todayIso) - 90 * 86400000)
    .toISOString()
    .slice(0, 10);
  return res.rows.map((r) => {
    const last = (r.last_sold as string | null) ?? null;
    return {
      brandName: r.brand_name as string,
      qtySold: Number(r.qty),
      valuePaisa: Number(r.value),
      lastSoldAd: last,
      deadStock: !last || last < deadCutoff,
    };
  });
}

// ---------- VAT summary ----------

export interface VatSummary {
  salesTaxablePaisa: number;
  salesVatPaisa: number;
  purchaseTaxablePaisa: number;
  purchaseVatPaisa: number;
}

export async function vatSummary(
  fromIso: string,
  toIso: string,
): Promise<VatSummary> {
  const sales = await db().execute({
    // A bill's own taxable amount (0024) excludes exempt services and, on a
    // VAT-inclusive bill, the VAT itself. Bills made before it fall back to
    // what this report always used.
    sql: `SELECT IFNULL(SUM(COALESCE(taxable_paisa, subtotal_paisa - discount_paisa)),0) AS taxable,
                 IFNULL(SUM(vat_paisa),0) AS vat
          FROM bills b WHERE ${NOT_CANCELLED} AND vat_paisa > 0
            AND b.date_ad >= ? AND b.date_ad <= ?`,
    args: [fromIso, toIso],
  });
  const purch = await db().execute({
    sql: `SELECT IFNULL(SUM(subtotal_paisa - discount_paisa - bill_discount_paisa),0) AS taxable,
                 IFNULL(SUM(vat_paisa),0) AS vat
          FROM purchases WHERE vat_paisa > 0 AND date_ad >= ? AND date_ad <= ?`,
    args: [fromIso, toIso],
  });
  return {
    salesTaxablePaisa: Number(sales.rows[0]!.taxable),
    salesVatPaisa: Number(sales.rows[0]!.vat),
    purchaseTaxablePaisa: Number(purch.rows[0]!.taxable),
    purchaseVatPaisa: Number(purch.rows[0]!.vat),
  };
}

/**
 * The 30-day trend, split into medicines and services, both net of refunds.
 *
 * Each series is computed on its own rather than one being subtracted from the
 * whole-bill total: the whole-bill total is gross of refunds, so subtracting a
 * net service figure from it produced a medicine line that disagreed with the
 * tile directly above it. Returns are attributed to the day they were given
 * back, matching how the summary tiles have always counted them.
 */
export async function trendByKind(
  fromIso: string,
  toIso: string,
): Promise<{ dateAd: string; medicinePaisa: number; servicePaisa: number }[]> {
  const rows = await db().execute({
    sql: `SELECT d AS date_ad,
                 SUM(med) AS med,
                 SUM(svc) AS svc
          FROM (
            SELECT b.date_ad AS d,
                   IFNULL(SUM(bl.amount_paisa), 0) AS med,
                   0 AS svc
              FROM bills b
              JOIN bill_lines bl ON bl.bill_id = b.id
             WHERE ${NOT_CANCELLED} AND b.date_ad BETWEEN ? AND ?
             GROUP BY b.date_ad

            UNION ALL

            SELECT b.date_ad, 0, IFNULL(SUM(sl.amount_paisa), 0)
              FROM bills b
              JOIN bill_service_lines sl ON sl.bill_id = b.id
             WHERE ${NOT_CANCELLED} AND b.date_ad BETWEEN ? AND ?
             GROUP BY b.date_ad

            UNION ALL

            SELECT sr.date_ad, -IFNULL(SUM(srl.amount_paisa), 0), 0
              FROM sale_returns sr
              JOIN sale_return_lines srl ON srl.sale_return_id = sr.id
             WHERE sr.date_ad BETWEEN ? AND ?
             GROUP BY sr.date_ad

            UNION ALL

            SELECT sr.date_ad, 0, -IFNULL(SUM(srsl.amount_paisa), 0)
              FROM sale_returns sr
              JOIN sale_return_service_lines srsl ON srsl.sale_return_id = sr.id
             WHERE sr.date_ad BETWEEN ? AND ?
             GROUP BY sr.date_ad
          )
          GROUP BY d
          ORDER BY d ASC`,
    args: [fromIso, toIso, fromIso, toIso, fromIso, toIso, fromIso, toIso],
  });
  return rows.rows.map((r) => ({
    dateAd: r.date_ad as string,
    medicinePaisa: Number(r.med),
    servicePaisa: Number(r.svc),
  }));
}
