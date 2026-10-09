/**
 * financials.ts — income and expenses for a period, in one place (C-037).
 *
 * Every line is read from the report that already owns it, so this summary
 * can never disagree with them:
 *
 *   billed                 bills in the period, as saved (incl. VAT)
 *   − refunds              given back in the period
 *   − VAT                  collected on those bills; it is the government's
 *   = income
 *   − doctors' share       earned on bills in the period (Doctor payouts)
 *   − laboratory costs     tests sent out in the period (Laboratory statements)
 *   − supplies bought      purchases less returns, without their VAT
 *   − salaries             gross pay for the BS months that start in the period
 *   − clinic's SSF         the employer's 20% for those months
 *   = left over
 *
 * Counted when earned or owed, not when paid: a share earned this month and
 * paid next month is this month's cost. What was actually paid out is beside
 * it, for the cash view.
 */
import "server-only";
import { db } from "@/lib/db";
import { doctorPayouts, partnerSummary } from "@/lib/repos/clinic-reports";
import { doctorPaidBetween } from "@/lib/repos/doctor-pay";
import { salaryCostForMonths } from "@/lib/repos/payroll";
import { adFromIso, adToIso, bsToDbText, toAD, toBS } from "@/lib/bs";
import { shiftMonth } from "@/lib/payroll";
import type { DateRange } from "@/lib/date-range";

export interface FinancialSummary {
  billedPaisa: number;
  refundsPaisa: number;
  vatPaisa: number;
  incomePaisa: number;
  doctorSharePaisa: number;
  labCostPaisa: number;
  suppliesPaisa: number;
  salariesPaisa: number;
  ssfEmployerPaisa: number;
  costsPaisa: number;
  leftOverPaisa: number;
  /** BS months whose salaries are counted, 'YYYY-MM' */
  salaryMonths: string[];
  paidOut: {
    doctorsPaisa: number;
    salariesPaisa: number;
    suppliersPaisa: number;
    laboratoriesPaisa: number;
  };
}

/** The BS months whose first day falls inside the range. */
export function monthsStartingIn(fromIso: string, toIso: string): string[] {
  const first = bsToDbText(toBS(adFromIso(fromIso))).slice(0, 7);
  const last = bsToDbText(toBS(adFromIso(toIso))).slice(0, 7);
  const out: string[] = [];
  for (let m = first; m <= last; m = shiftMonth(m, 1)) {
    const [y, mo] = m.split("-").map(Number) as [number, number];
    const startAd = adToIso(toAD({ year: y, month: mo, day: 1 }));
    if (startAd >= fromIso && startAd <= toIso) out.push(m);
  }
  return out;
}

const one = async (sql: string, args: string[]) =>
  Number((await db().execute({ sql, args })).rows[0]?.n ?? 0);

export async function financialSummary(range: DateRange): Promise<FinancialSummary> {
  const { fromIso, toIso } = range;
  const months = monthsStartingIn(fromIso, toIso);

  const [
    billed,
    refunds,
    vat,
    doctors,
    labs,
    purchases,
    purchaseVat,
    purchaseReturns,
    salary,
    doctorsPaid,
    salariesPaid,
    suppliersPaid,
    labsPaid,
  ] = await Promise.all([
    one(`SELECT IFNULL(SUM(total_paisa),0) AS n FROM bills
          WHERE status = 'saved' AND date_ad BETWEEN ? AND ?`, [fromIso, toIso]),
    one(`SELECT IFNULL(SUM(total_paisa),0) AS n FROM sale_returns
          WHERE date_ad BETWEEN ? AND ?`, [fromIso, toIso]),
    one(`SELECT IFNULL(SUM(vat_paisa),0) AS n FROM bills
          WHERE status = 'saved' AND date_ad BETWEEN ? AND ?`, [fromIso, toIso]),
    doctorPayouts(range),
    partnerSummary(range),
    one(`SELECT IFNULL(SUM(total_paisa),0) AS n FROM purchases
          WHERE date_ad BETWEEN ? AND ?`, [fromIso, toIso]),
    one(`SELECT IFNULL(SUM(vat_paisa),0) AS n FROM purchases
          WHERE date_ad BETWEEN ? AND ?`, [fromIso, toIso]),
    one(`SELECT IFNULL(SUM(total_paisa),0) AS n FROM purchase_returns
          WHERE date_ad BETWEEN ? AND ?`, [fromIso, toIso]),
    salaryCostForMonths(months),
    doctorPaidBetween(fromIso, toIso),
    one(`SELECT IFNULL(SUM(amount_paisa),0) AS n FROM salary_payments
          WHERE voided_at IS NULL AND date_ad BETWEEN ? AND ?`, [fromIso, toIso]),
    one(`SELECT IFNULL(SUM(amount_paisa),0) AS n FROM supplier_payments
          WHERE voided_at IS NULL AND date_ad BETWEEN ? AND ?`, [fromIso, toIso]),
    one(`SELECT IFNULL(SUM(amount_paisa),0) AS n FROM lab_partner_payments
          WHERE voided_at IS NULL AND date_ad BETWEEN ? AND ?`, [fromIso, toIso]),
  ]);

  const income = billed - refunds - vat;
  const doctorShare = doctors.reduce((s, r) => s + r.sharePaisa, 0);
  const labCost = labs.reduce((s, r) => s + r.testsPaisa, 0);
  const supplies = purchases - purchaseVat - purchaseReturns;
  const costs = doctorShare + labCost + supplies + salary.grossPaisa + salary.ssfEmployerPaisa;

  return {
    billedPaisa: billed,
    refundsPaisa: refunds,
    vatPaisa: vat,
    incomePaisa: income,
    doctorSharePaisa: doctorShare,
    labCostPaisa: labCost,
    suppliesPaisa: supplies,
    salariesPaisa: salary.grossPaisa,
    ssfEmployerPaisa: salary.ssfEmployerPaisa,
    costsPaisa: costs,
    leftOverPaisa: income - costs,
    salaryMonths: months,
    paidOut: {
      doctorsPaisa: [...doctorsPaid.values()].reduce((s, x) => s + x, 0),
      salariesPaisa: salariesPaid,
      suppliersPaisa: suppliersPaid,
      laboratoriesPaisa: labsPaid,
    },
  };
}
