/**
 * payroll.ts — one staff member's salary for one month (C-037, 0025).
 *
 *   salary (the rate for that month) + bonuses              = gross
 *   − SSF 11%      on the salary, when they are on the fund
 *   − tax 1%       social security tax on the gross, when they are NOT on the
 *                  fund (contributors are exempt from it)
 *   − deductions   absence, a loan, anything typed on the month
 *   − advance      what is recovered this month of money paid ahead
 *                                                            = net to pay
 *   − paid         salary payments for the month              = left to pay
 *
 * The clinic also owes 20% of the salary to the fund as the employer's share.
 * That is shown beside the sheet, never taken from the staff member.
 *
 * Income tax above the first slab depends on the whole year and the person's
 * circumstances; it is not worked out here. Enter it as a deduction line.
 *
 * Pure: the month sheet, the staff page and the exports all read it.
 */
import { BS_MONTHS_EN } from "@/lib/bs";

/** Basis points: 1100 = 11%. */
export const SSF_STAFF_BP = 1100;
export const SSF_EMPLOYER_BP = 2000;
export const SST_BP = 100;

const pct = (paisa: number, bp: number) => Math.round((paisa * bp) / 10_000);

export interface PayRate {
  fromMonthBs: string;
  monthlySalaryPaisa: number;
  ssfEnrolled: boolean;
  sstApplies: boolean;
}

/** The rate a month is paid at: the latest one that had started by then. */
export function rateFor<T extends PayRate>(rates: T[], monthBs: string): T | null {
  let best: T | null = null;
  for (const r of rates) {
    if (r.fromMonthBs <= monthBs && (!best || r.fromMonthBs > best.fromMonthBs)) best = r;
  }
  return best;
}

export interface MonthPay {
  salaryPaisa: number;
  bonusPaisa: number;
  grossPaisa: number;
  ssfStaffPaisa: number;
  sstPaisa: number;
  deductionPaisa: number;
  advanceRecoveredPaisa: number;
  /** what is due to the staff member for the month */
  netPaisa: number;
  paidPaisa: number;
  /** net less paid; below zero means more was paid than was due */
  leftPaisa: number;
  /** the clinic's own 20% to the fund — not taken from the salary */
  ssfEmployerPaisa: number;
}

export function monthPay(input: {
  rate: Pick<PayRate, "monthlySalaryPaisa" | "ssfEnrolled" | "sstApplies">;
  bonusesPaisa: number[];
  deductionsPaisa: number[];
  advanceRecoveredPaisa: number;
  paidPaisa: number;
}): MonthPay {
  const salary = Math.max(0, input.rate.monthlySalaryPaisa);
  const bonus = input.bonusesPaisa.reduce((s, x) => s + Math.max(0, x), 0);
  const gross = salary + bonus;
  const ssfStaff = input.rate.ssfEnrolled ? pct(salary, SSF_STAFF_BP) : 0;
  const sst = !input.rate.ssfEnrolled && input.rate.sstApplies ? pct(gross, SST_BP) : 0;
  const deduction = input.deductionsPaisa.reduce((s, x) => s + Math.max(0, x), 0);
  const advance = Math.max(0, input.advanceRecoveredPaisa);
  const net = gross - ssfStaff - sst - deduction - advance;
  return {
    salaryPaisa: salary,
    bonusPaisa: bonus,
    grossPaisa: gross,
    ssfStaffPaisa: ssfStaff,
    sstPaisa: sst,
    deductionPaisa: deduction,
    advanceRecoveredPaisa: advance,
    netPaisa: net,
    paidPaisa: input.paidPaisa,
    leftPaisa: net - input.paidPaisa,
    ssfEmployerPaisa: input.rate.ssfEnrolled ? pct(salary, SSF_EMPLOYER_BP) : 0,
  };
}

/** 'YYYY-MM' of a BS date text 'YYYY-MM-DD'. */
export function monthOf(dateBs: string): string {
  return dateBs.slice(0, 7);
}

/** The month before or after a 'YYYY-MM'. */
export function shiftMonth(monthBs: string, by: number): string {
  const [y, m] = monthBs.split("-").map(Number) as [number, number];
  const n = y * 12 + (m - 1) + by;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
}

export function isMonth(text: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text);
}

/** "Ashwin 2083" for '2083-06'. */
export function monthLabel(monthBs: string): string {
  const [y, m] = monthBs.split("-").map(Number) as [number, number];
  return `${BS_MONTHS_EN[m - 1] ?? monthBs} ${y}`;
}
