/**
 * payroll.ts — staff, their salaries, and what each month comes to (C-037,
 * 0025).
 *
 * A month's sheet is never stored. It is worked out from the rate that month
 * was paid at, its bonus and deduction lines, the advance recovered on it and
 * the salary paid for it — `monthPay` in `lib/payroll.ts` — so correcting any
 * one of those corrects the sheet.
 *
 * Lines and payments typed wrong are undone with a reason, never deleted, and
 * money paid in a closed fiscal year stays where it is (D-029).
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import { bsFromDbText, fiscalYearOf } from "@/lib/bs";
import { monthOf, monthPay, rateFor, type MonthPay, type PayRate } from "@/lib/payroll";

export class PayrollError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
    this.name = "PayrollError";
  }
}

export interface Staff {
  id: string;
  name: string;
  designation: string;
  phone: string;
  panNo: string;
  ssfNo: string;
  bankAccount: string;
  note: string;
  joinedBs: string | null;
  leftBs: string | null;
  rates: (PayRate & { id: string })[];
}

export interface StaffInput {
  name: string;
  designation: string;
  phone: string;
  panNo: string;
  ssfNo: string;
  bankAccount: string;
  note: string;
  joinedBs: string | null;
  leftBs: string | null;
}

function mapRate(r: Row): PayRate & { id: string } {
  return {
    id: r.id as string,
    fromMonthBs: r.from_month_bs as string,
    monthlySalaryPaisa: Number(r.monthly_salary_paisa),
    ssfEnrolled: Number(r.ssf_enrolled) === 1,
    sstApplies: Number(r.sst_applies) === 1,
  };
}

export async function listStaff(): Promise<Staff[]> {
  const [people, rates] = await Promise.all([
    db().execute("SELECT * FROM staff ORDER BY (left_bs IS NOT NULL), name"),
    db().execute("SELECT * FROM staff_pay_rates ORDER BY from_month_bs"),
  ]);
  const byStaff = new Map<string, (PayRate & { id: string })[]>();
  for (const r of rates.rows) {
    const id = r.staff_id as string;
    if (!byStaff.has(id)) byStaff.set(id, []);
    byStaff.get(id)!.push(mapRate(r));
  }
  return people.rows.map((r: Row) => ({
    id: r.id as string,
    name: r.name as string,
    designation: (r.designation as string) ?? "",
    phone: (r.phone as string) ?? "",
    panNo: (r.pan_no as string) ?? "",
    ssfNo: (r.ssf_no as string) ?? "",
    bankAccount: (r.bank_account as string) ?? "",
    note: (r.note as string) ?? "",
    joinedBs: (r.joined_bs as string | null) ?? null,
    leftBs: (r.left_bs as string | null) ?? null,
    rates: byStaff.get(r.id as string) ?? [],
  }));
}

export async function getStaff(id: string): Promise<Staff | null> {
  return (await listStaff()).find((s) => s.id === id) ?? null;
}

const STAFF_COLS = [
  "name", "designation", "phone", "pan_no", "ssf_no", "bank_account", "note",
  "joined_bs", "left_bs",
] as const;

function staffArgs(s: StaffInput) {
  return [
    s.name.trim(), s.designation.trim(), s.phone.trim(), s.panNo.trim(),
    s.ssfNo.trim(), s.bankAccount.trim(), s.note.trim(), s.joinedBs, s.leftBs,
  ];
}

/** Add a person and the salary they start on. */
export async function createStaff(
  s: StaffInput,
  rate: PayRate,
  userId: string,
): Promise<string> {
  const id = ulid();
  const now = new Date().toISOString();
  await db().batch(
    [
      {
        sql: `INSERT INTO staff (id, ${STAFF_COLS.join(", ")}, created_at, updated_at)
              VALUES (?, ${STAFF_COLS.map(() => "?").join(", ")}, ?, ?)`,
        args: [id, ...staffArgs(s), now, now],
      },
      rateStatement(id, rate, userId, now),
    ],
    "write",
  );
  return id;
}

export async function updateStaff(id: string, s: StaffInput): Promise<void> {
  await db().execute({
    sql: `UPDATE staff SET ${STAFF_COLS.map((c) => `${c} = ?`).join(", ")}, updated_at = ?
           WHERE id = ?`,
    args: [...staffArgs(s), new Date().toISOString(), id],
  });
}

function rateStatement(staffId: string, rate: PayRate, userId: string, now: string) {
  // One rate per starting month: setting it again for the same month corrects it.
  return {
    sql: `INSERT INTO staff_pay_rates
            (id, staff_id, from_month_bs, monthly_salary_paisa, ssf_enrolled, sst_applies,
             user_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (staff_id, from_month_bs) DO UPDATE SET
            monthly_salary_paisa = excluded.monthly_salary_paisa,
            ssf_enrolled = excluded.ssf_enrolled,
            sst_applies = excluded.sst_applies,
            user_id = excluded.user_id,
            created_at = excluded.created_at`,
    args: [
      ulid(), staffId, rate.fromMonthBs, rate.monthlySalaryPaisa,
      rate.ssfEnrolled ? 1 : 0, rate.sstApplies ? 1 : 0, userId, now,
    ],
  };
}

/** A new salary from a month on; earlier months keep the rate they had. */
export async function setPayRate(staffId: string, rate: PayRate, userId: string): Promise<void> {
  const now = new Date().toISOString();
  await db().batch(
    [
      rateStatement(staffId, rate, userId, now),
      {
        sql: `INSERT INTO audit_log (id, user_id, action, detail_json, at)
              VALUES (?, ?, 'staff.pay_rate', ?, ?)`,
        args: [ulid(), userId, JSON.stringify({ entity: "staff", entityId: staffId, ...rate }), now],
      },
    ],
    "write",
  );
}

// ---------- lines, payments, advances ----------

export interface SalaryLine {
  id: string;
  staffId: string;
  monthBs: string;
  kind: "bonus" | "deduction" | "advance_recovery";
  label: string;
  amountPaisa: number;
  voided: boolean;
}

export interface SalaryPayment {
  id: string;
  staffId: string;
  kind: "salary" | "advance";
  monthBs: string;
  dateBs: string;
  amountPaisa: number;
  method: string;
  note: string;
  userName: string;
  createdAt: string;
  voided: boolean;
  voidReason: string;
}

async function linesFor(where: string, args: string[]): Promise<SalaryLine[]> {
  const res = await db().execute({
    sql: `SELECT * FROM salary_adjustments WHERE ${where} ORDER BY created_at`,
    args,
  });
  return res.rows.map((r: Row) => ({
    id: r.id as string,
    staffId: r.staff_id as string,
    monthBs: r.month_bs as string,
    kind: r.kind as SalaryLine["kind"],
    label: (r.label as string) ?? "",
    amountPaisa: Number(r.amount_paisa),
    voided: r.voided_at != null,
  }));
}

async function paymentsFor(where: string, args: string[]): Promise<SalaryPayment[]> {
  const res = await db().execute({
    sql: `SELECT sp.*, u.name AS user_name FROM salary_payments sp
            LEFT JOIN users u ON u.id = sp.user_id
           WHERE ${where} ORDER BY sp.date_ad, sp.created_at`,
    args,
  });
  return res.rows.map((r: Row) => ({
    id: r.id as string,
    staffId: r.staff_id as string,
    kind: r.kind as SalaryPayment["kind"],
    monthBs: r.month_bs as string,
    dateBs: r.date_bs as string,
    amountPaisa: Number(r.amount_paisa),
    method: r.method as string,
    note: (r.note as string) ?? "",
    userName: (r.user_name as string | null) ?? "",
    createdAt: r.created_at as string,
    voided: r.voided_at != null,
    voidReason: (r.void_reason as string) ?? "",
  }));
}

/** Money paid ahead and not yet recovered, per staff member. */
export async function advancesOutstanding(): Promise<Map<string, number>> {
  const res = await db().execute(
    `SELECT s.id,
            COALESCE((SELECT SUM(amount_paisa) FROM salary_payments p
                       WHERE p.staff_id = s.id AND p.kind = 'advance' AND p.voided_at IS NULL), 0)
          - COALESCE((SELECT SUM(amount_paisa) FROM salary_adjustments a
                       WHERE a.staff_id = s.id AND a.kind = 'advance_recovery'
                         AND a.voided_at IS NULL), 0) AS outstanding
       FROM staff s`,
  );
  return new Map(res.rows.map((r) => [r.id as string, Number(r.outstanding)]));
}

// ---------- the month sheet ----------

export interface SheetRow {
  staff: Pick<Staff, "id" | "name" | "designation">;
  rate: PayRate;
  pay: MonthPay;
  lines: SalaryLine[];
  payments: SalaryPayment[];
  advanceOutstandingPaisa: number;
}

export interface MonthSheet {
  monthBs: string;
  rows: SheetRow[];
  totals: {
    grossPaisa: number;
    ssfStaffPaisa: number;
    ssfEmployerPaisa: number;
    sstPaisa: number;
    netPaisa: number;
    paidPaisa: number;
    leftPaisa: number;
  };
}

/** Whether a person is on the payroll in a month: had a rate, and had not left. */
function onPayroll(s: Staff, monthBs: string): boolean {
  if (!rateFor(s.rates, monthBs)) return false;
  if (s.leftBs && monthBs > monthOf(s.leftBs)) return false;
  return true;
}

export async function monthSheet(monthBs: string): Promise<MonthSheet> {
  const [staff, lines, payments, advances] = await Promise.all([
    listStaff(),
    linesFor("month_bs = ?", [monthBs]),
    paymentsFor("sp.month_bs = ? AND sp.kind = 'salary'", [monthBs]),
    advancesOutstanding(),
  ]);

  const rows: SheetRow[] = staff
    .filter((s) => onPayroll(s, monthBs))
    .map((s) => {
      const rate = rateFor(s.rates, monthBs)!;
      const mine = lines.filter((l) => l.staffId === s.id);
      const live = mine.filter((l) => !l.voided);
      const paid = payments.filter((p) => p.staffId === s.id);
      const pay = monthPay({
        rate,
        bonusesPaisa: live.filter((l) => l.kind === "bonus").map((l) => l.amountPaisa),
        deductionsPaisa: live.filter((l) => l.kind === "deduction").map((l) => l.amountPaisa),
        advanceRecoveredPaisa: live
          .filter((l) => l.kind === "advance_recovery")
          .reduce((t, l) => t + l.amountPaisa, 0),
        paidPaisa: paid.filter((p) => !p.voided).reduce((t, p) => t + p.amountPaisa, 0),
      });
      return {
        staff: { id: s.id, name: s.name, designation: s.designation },
        rate,
        pay,
        lines: mine,
        payments: paid,
        advanceOutstandingPaisa: advances.get(s.id) ?? 0,
      };
    });

  const sum = (f: (p: MonthPay) => number) => rows.reduce((t, r) => t + f(r.pay), 0);
  return {
    monthBs,
    rows,
    totals: {
      grossPaisa: sum((p) => p.grossPaisa),
      ssfStaffPaisa: sum((p) => p.ssfStaffPaisa),
      ssfEmployerPaisa: sum((p) => p.ssfEmployerPaisa),
      sstPaisa: sum((p) => p.sstPaisa),
      netPaisa: sum((p) => p.netPaisa),
      paidPaisa: sum((p) => p.paidPaisa),
      leftPaisa: sum((p) => p.leftPaisa),
    },
  };
}

/** One person's months, newest first, from their first rate to `toMonth`. */
export async function staffMonths(
  staffId: string,
  toMonth: string,
  limit = 24,
): Promise<{ monthBs: string; pay: MonthPay }[]> {
  const s = await getStaff(staffId);
  if (!s || s.rates.length === 0) return [];
  const [lines, payments] = await Promise.all([
    linesFor("staff_id = ? AND voided_at IS NULL", [staffId]),
    paymentsFor("sp.staff_id = ? AND sp.kind = 'salary' AND sp.voided_at IS NULL", [staffId]),
  ]);
  const first = s.rates[0]!.fromMonthBs;
  const out: { monthBs: string; pay: MonthPay }[] = [];
  let m = toMonth;
  while (m >= first && out.length < limit) {
    if (onPayroll(s, m)) {
      const ls = lines.filter((l) => l.monthBs === m);
      out.push({
        monthBs: m,
        pay: monthPay({
          rate: rateFor(s.rates, m)!,
          bonusesPaisa: ls.filter((l) => l.kind === "bonus").map((l) => l.amountPaisa),
          deductionsPaisa: ls.filter((l) => l.kind === "deduction").map((l) => l.amountPaisa),
          advanceRecoveredPaisa: ls
            .filter((l) => l.kind === "advance_recovery")
            .reduce((t, l) => t + l.amountPaisa, 0),
          paidPaisa: payments.filter((p) => p.monthBs === m).reduce((t, p) => t + p.amountPaisa, 0),
        }),
      });
    }
    const [y, mo] = m.split("-").map(Number) as [number, number];
    m = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
  }
  return out;
}

/** Every payment and advance to one person, newest first. */
export async function staffPayments(staffId: string): Promise<SalaryPayment[]> {
  return (await paymentsFor("sp.staff_id = ?", [staffId])).reverse();
}

// ---------- writing ----------

async function assertOpenYear(dateBs: string): Promise<void> {
  const label = fiscalYearOf(bsFromDbText(dateBs)).label;
  const fy = await db().execute({
    sql: "SELECT status FROM fiscal_years WHERE bs_label = ?",
    args: [label],
  });
  const status = fy.rows[0]?.status as string | undefined;
  if (status !== undefined && status !== "open") {
    throw new PayrollError(`Fiscal year ${label} is closed, so nothing can be paid or undone in it.`);
  }
}

function audit(userId: string, action: string, detail: Record<string, unknown>, now: string) {
  return {
    sql: `INSERT INTO audit_log (id, user_id, action, detail_json, at) VALUES (?, ?, ?, ?, ?)`,
    args: [ulid(), userId, action, JSON.stringify(detail), now],
  };
}

export async function addSalaryLine(input: {
  staffId: string;
  monthBs: string;
  kind: "bonus" | "deduction";
  label: string;
  amountPaisa: number;
  userId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const id = ulid();
  await db().batch(
    [
      {
        sql: `INSERT INTO salary_adjustments
                (id, staff_id, month_bs, kind, label, amount_paisa, user_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, input.staffId, input.monthBs, input.kind, input.label.trim(), input.amountPaisa, input.userId, now],
      },
      audit(input.userId, "salary.line", { entity: "staff", entityId: input.staffId, lineId: id, ...input }, now),
    ],
    "write",
  );
}

/**
 * Pay a month's salary, recovering part of an advance on the way when asked.
 * The recovery is a line on the month, so the sheet shows it; it can never be
 * more than is outstanding.
 */
export async function paySalary(input: {
  staffId: string;
  monthBs: string;
  dateAd: string;
  dateBs: string;
  amountPaisa: number;
  method: string;
  note: string;
  recoverAdvancePaisa: number;
  userId: string;
}): Promise<void> {
  await assertOpenYear(input.dateBs);
  if (input.recoverAdvancePaisa > 0) {
    const outstanding = (await advancesOutstanding()).get(input.staffId) ?? 0;
    if (input.recoverAdvancePaisa > outstanding) {
      throw new PayrollError("That is more than the advance still to recover.");
    }
  }
  const now = new Date().toISOString();
  const stmts = [];
  if (input.recoverAdvancePaisa > 0) {
    stmts.push({
      sql: `INSERT INTO salary_adjustments
              (id, staff_id, month_bs, kind, label, amount_paisa, user_id, created_at)
            VALUES (?, ?, ?, 'advance_recovery', 'Advance recovered', ?, ?, ?)`,
      args: [ulid(), input.staffId, input.monthBs, input.recoverAdvancePaisa, input.userId, now],
    });
  }
  if (input.amountPaisa > 0) {
    const id = ulid();
    stmts.push({
      sql: `INSERT INTO salary_payments
              (id, staff_id, kind, month_bs, date_ad, date_bs, amount_paisa, method, note,
               user_id, created_at)
            VALUES (?, ?, 'salary', ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id, input.staffId, input.monthBs, input.dateAd, input.dateBs, input.amountPaisa,
        input.method, input.note.trim(), input.userId, now,
      ],
    });
  }
  if (stmts.length === 0) throw new PayrollError("Enter an amount to pay.");
  stmts.push(audit(input.userId, "salary.paid", { entity: "staff", entityId: input.staffId, ...input }, now));
  await db().batch(stmts, "write");
}

export async function giveAdvance(input: {
  staffId: string;
  dateAd: string;
  dateBs: string;
  amountPaisa: number;
  method: string;
  note: string;
  userId: string;
}): Promise<void> {
  await assertOpenYear(input.dateBs);
  const now = new Date().toISOString();
  await db().batch(
    [
      {
        sql: `INSERT INTO salary_payments
                (id, staff_id, kind, month_bs, date_ad, date_bs, amount_paisa, method, note,
                 user_id, created_at)
              VALUES (?, ?, 'advance', ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          ulid(), input.staffId, monthOf(input.dateBs), input.dateAd, input.dateBs,
          input.amountPaisa, input.method, input.note.trim(), input.userId, now,
        ],
      },
      audit(input.userId, "salary.advance", { entity: "staff", entityId: input.staffId, ...input }, now),
    ],
    "write",
  );
}

/** Undo a payment, an advance or a line typed wrong. It stays on file, marked. */
export async function undoSalaryEntry(input: {
  kind: "payment" | "line";
  id: string;
  reason: string;
  userId: string;
}): Promise<{ staffId: string }> {
  const reason = input.reason.trim();
  if (!reason) throw new PayrollError("Say why this is being undone.");
  const table = input.kind === "payment" ? "salary_payments" : "salary_adjustments";
  const res = await db().execute({
    sql: `SELECT * FROM ${table} WHERE id = ?`,
    args: [input.id],
  });
  const row = res.rows[0] as Row | undefined;
  if (!row) throw new PayrollError("That is not there any more.");
  if (row.voided_at != null) throw new PayrollError("That has already been undone.");
  if (input.kind === "payment") await assertOpenYear(row.date_bs as string);
  // An advance already recovered from salary can't simply vanish: the
  // recovery lines would then take back money that was never lent.
  if (input.kind === "payment" && row.kind === "advance") {
    const outstanding = (await advancesOutstanding()).get(row.staff_id as string) ?? 0;
    if (outstanding < Number(row.amount_paisa)) {
      throw new PayrollError(
        "Part of this advance has already been recovered from salary. Undo those recoveries first.",
      );
    }
  }
  const now = new Date().toISOString();
  await db().batch(
    [
      {
        sql: `UPDATE ${table} SET voided_at = ?, voided_by = ?, void_reason = ?
               WHERE id = ? AND voided_at IS NULL`,
        args: [now, input.userId, reason, input.id],
      },
      audit(input.userId, "salary.undone", { table, id: input.id, reason }, now),
    ],
    "write",
  );
  return { staffId: row.staff_id as string };
}

/** What salaries came to for the months in a period — for the financial summary. */
export async function salaryCostForMonths(months: string[]): Promise<{
  grossPaisa: number;
  ssfEmployerPaisa: number;
}> {
  let gross = 0;
  let employer = 0;
  for (const m of months) {
    const sheet = await monthSheet(m);
    gross += sheet.totals.grossPaisa;
    employer += sheet.totals.ssfEmployerPaisa;
  }
  return { grossPaisa: gross, ssfEmployerPaisa: employer };
}
