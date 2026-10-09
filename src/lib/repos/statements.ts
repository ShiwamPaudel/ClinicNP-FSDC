/**
 * statements.ts — the ledgers that leave the building, built from the same
 * reads their screens use (C-036): a supplier's ledger, a laboratory's
 * statement for a period, and the dues list (everyone, or one person).
 *
 * Each returns a `Statement`; `lib/export/` draws it as a PDF or an Excel
 * sheet. Nothing here works out a balance of its own.
 */
import "server-only";
import { getSupplier, supplierLedger } from "@/lib/repos/suppliers";
import { partnerStatement } from "@/lib/repos/clinic-reports";
import { getLabPartner } from "@/lib/repos/lab-partners";
import { listDuePeople } from "@/lib/repos/dues";
import { formatDocNo } from "@/lib/invoice-number";
import { formatPatientNo } from "@/lib/patient-no";
import { nepalTime } from "@/lib/clock";
import { MONEY_METHOD_LABEL, isMoneyMethod } from "@/lib/dues";
import { fileSlug, type Statement, type StatementRow } from "@/lib/statement";
import type { DateRange } from "@/lib/date-range";
import { doctorPayStatement } from "@/lib/repos/doctor-pay";
import { payableMethodLabel } from "@/lib/payables";
import { getStaff, monthSheet } from "@/lib/repos/payroll";
import { formatPaisa } from "@/lib/money";
import { monthLabel } from "@/lib/payroll";
import { financialSummary } from "@/lib/repos/financials";

const SHARE_STATUS: Record<string, string> = { paid: "Paid", part: "Part paid", unpaid: "Unpaid" };

/**
 * A doctor's account (C-037): every share earned, with whether it is paid,
 * and every payout with the bills it covered. Shares and payouts are listed
 * in date order with a running balance, so it reads like any other ledger.
 */
export async function doctorStatement(doctorId: string, asOf: string): Promise<Statement | null> {
  const st = await doctorPayStatement(doctorId);
  if (!st) return null;

  type Entry = { dateAd: string; order: number; row: StatementRow; delta: number };
  const entries: Entry[] = [
    ...st.shares.map((l) => ({
      dateAd: l.dateAd,
      order: 0,
      delta: l.earnedPaisa,
      row: {
        cells: {
          date: l.dateBs,
          what: `${l.service}${l.qty > 1 ? ` × ${l.qty}` : ""} · ${l.billLabel}${l.patientName ? ` · ${l.patientName}` : ""}`,
          earned: l.earnedPaisa,
          paid: null,
          status: SHARE_STATUS[l.status] ?? l.status,
          balance: 0,
        },
      } as StatementRow,
    })),
    ...st.payouts
      .filter((p) => !p.voided)
      .map((p) => ({
        dateAd: p.dateAd,
        order: 1,
        delta: -p.amountPaisa,
        row: {
          cells: {
            date: p.dateBs,
            what: [
              `Paid · ${payableMethodLabel(p.method)}`,
              p.covers.length ? `for ${p.covers.map((c) => c.billLabel).join(", ")}` : "",
              p.aheadPaisa > 0 ? "(part paid ahead)" : "",
              p.note,
            ]
              .filter(Boolean)
              .join(" "),
            earned: null,
            paid: p.amountPaisa,
            status: "",
            balance: 0,
          },
        } as StatementRow,
      })),
  ].sort((a, b) => a.dateAd.localeCompare(b.dateAd) || a.order - b.order);

  let balance = 0;
  for (const e of entries) {
    balance += e.delta;
    e.row.cells.balance = balance;
  }

  return {
    fileName: fileSlug("doctor-statement", st.name),
    title: "Doctor statement",
    party: { name: st.name, lines: [] },
    period: `All entries up to ${asOf}`,
    summary: [
      { label: "Earned", paisa: st.earnedPaisa },
      { label: "Paid", paisa: st.paidPaisa },
      { label: st.owedPaisa < 0 ? "Paid ahead" : "Owed now", paisa: Math.abs(st.owedPaisa) },
    ],
    columns: [
      { key: "date", label: "Date", width: 12 },
      { key: "what", label: "Particulars", width: 40 },
      { key: "earned", label: "Share", width: 13, money: true },
      { key: "paid", label: "Paid", width: 13, money: true },
      { key: "status", label: "Status", width: 10 },
      { key: "balance", label: "Balance", width: 14, money: true },
    ],
    rows: entries.map((e) => e.row),
    totals: {
      date: "",
      what: "Total",
      earned: st.earnedPaisa,
      paid: st.paidPaisa,
      status: "",
      balance: st.owedPaisa,
    },
    emptyText: "No share earned or paid yet.",
  };
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** A supplier's whole ledger: purchases, returns and payments, with the balance. */
export async function supplierStatement(
  supplierId: string,
  asOf: string,
): Promise<Statement | null> {
  const supplier = await getSupplier(supplierId);
  if (!supplier) return null;
  const { entries, balancePaisa } = await supplierLedger(supplierId);

  const rows: StatementRow[] = entries.map((e) => ({
    cells: {
      date: e.dateBs,
      what: e.description,
      bought: e.deltaPaisa > 0 ? e.deltaPaisa : null,
      paid: e.deltaPaisa < 0 ? -e.deltaPaisa : null,
      balance: e.balancePaisa,
    },
  }));
  const bought = sum(entries.filter((e) => e.deltaPaisa > 0).map((e) => e.deltaPaisa));
  const paid = sum(entries.filter((e) => e.deltaPaisa < 0).map((e) => -e.deltaPaisa));

  return {
    fileName: fileSlug("supplier-ledger", supplier.name),
    title: "Supplier ledger",
    party: {
      name: supplier.name,
      lines: [
        supplier.panNo ? `PAN/VAT No: ${supplier.panNo}` : "",
        [supplier.phone, supplier.address].filter(Boolean).join(" · "),
        supplier.contactPerson ? `Contact: ${supplier.contactPerson}` : "",
      ],
    },
    period: `All entries up to ${asOf}`,
    summary: [
      { label: "Bought", paisa: bought },
      { label: "Paid and returned", paisa: paid },
      { label: "Owed now", paisa: balancePaisa },
    ],
    columns: [
      { key: "date", label: "Date", width: 12 },
      { key: "what", label: "Particulars", width: 40 },
      { key: "bought", label: "Purchase", width: 15, money: true },
      { key: "paid", label: "Paid / returned", width: 15, money: true },
      { key: "balance", label: "Balance", width: 15, money: true },
    ],
    rows,
    totals: { date: "", what: "Total", bought, paid, balance: balancePaisa },
    emptyText: "Nothing bought from or paid to this supplier yet.",
  };
}

/** A laboratory's statement for a period, opening and closing balance included. */
export async function labStatement(
  partnerId: string,
  range: DateRange,
): Promise<Statement | null> {
  const [st, partner] = await Promise.all([
    partnerStatement(partnerId, range),
    getLabPartner(partnerId),
  ]);
  if (!st) return null;

  const rows: StatementRow[] = [
    {
      style: "sub",
      cells: { date: "", what: "Owed at the start", charge: null, paid: null, balance: st.openingPaisa },
    },
    ...st.entries.map((e) => ({
      cells: {
        date: e.dateBs,
        what: e.description,
        charge: e.chargePaisa > 0 ? e.chargePaisa : null,
        paid: e.paymentPaisa > 0 ? e.paymentPaisa : null,
        balance: e.runningPaisa,
      },
    })),
  ];

  return {
    fileName: fileSlug("laboratory-statement", st.partnerName, range.label),
    title: "Laboratory statement",
    party: {
      name: st.partnerName,
      lines: partner
        ? [
            partner.panNo ? `PAN/VAT No: ${partner.panNo}` : "",
            [partner.phone, partner.address].filter(Boolean).join(" · "),
            partner.contactPerson ? `Contact: ${partner.contactPerson}` : "",
          ]
        : [],
    },
    period: range.label,
    summary: [
      { label: "Owed at the start", paisa: st.openingPaisa },
      { label: "Tests sent", paisa: st.testsPaisa },
      { label: "Paid", paisa: st.paymentsPaisa },
      { label: "Owed at the end", paisa: st.closingPaisa },
    ],
    columns: [
      { key: "date", label: "Date", width: 12 },
      { key: "what", label: "Particulars", width: 40 },
      { key: "charge", label: "Tests sent", width: 15, money: true },
      { key: "paid", label: "Paid", width: 15, money: true },
      { key: "balance", label: "Balance", width: 15, money: true },
    ],
    rows,
    totals: {
      date: "",
      what: "Total",
      charge: st.testsPaisa,
      paid: st.paymentsPaisa,
      balance: st.closingPaisa,
    },
    emptyText: "Nothing happened with this laboratory in this period.",
  };
}

function methodWord(method: string): string {
  return isMoneyMethod(method) ? MONEY_METHOD_LABEL[method] : method;
}

/**
 * Who owes what, biggest debt first, each bill under its person. With a
 * `personKey` (from the Dues screen) it is one person's statement instead,
 * with every payment listed under its bill.
 */
export async function duesStatement(
  todayAd: string,
  asOf: string,
  personKey?: string,
): Promise<Statement | null> {
  const everyone = await listDuePeople(todayAd);
  const people = personKey ? everyone.filter((p) => p.key === personKey) : everyone;
  if (personKey && people.length === 0) return null;
  const one = personKey ? people[0]! : null;

  const billLabel = (b: { invoiceNo: number | null; fiscalLabel: string }) =>
    b.invoiceNo != null ? formatDocNo("SI", b.fiscalLabel, b.invoiceNo) : "(no number)";
  const paidOn = (b: { totalPaisa: number; duePaisa: number; receivedPaisa: number }) =>
    b.totalPaisa - b.duePaisa + b.receivedPaisa;

  const rows: StatementRow[] = [];
  for (const p of people) {
    if (!one) {
      rows.push({
        style: "group",
        cells: {
          what: [
            p.name || "(no name)",
            p.patientNo != null ? formatPatientNo(p.patientNo) : "",
            p.phone,
          ]
            .filter(Boolean)
            .join(" · "),
          date: "",
          total: null,
          paid: null,
          owed: p.owedPaisa,
          days: "",
        },
      });
    }
    for (const b of p.bills) {
      const days = Math.max(
        0,
        Math.round((Date.parse(`${todayAd}T00:00:00Z`) - Date.parse(`${b.dateAd}T00:00:00Z`)) / 86_400_000),
      );
      rows.push({
        cells: {
          what: `Bill ${billLabel(b)}`,
          date: b.dateBs,
          total: b.totalPaisa,
          paid: paidOn(b),
          owed: b.balancePaisa,
          days: String(days),
        },
      });
      if (one) {
        for (const pay of b.payments ?? []) {
          rows.push({
            style: "sub",
            cells: {
              what: `${pay.kind === "at_sale" ? "Paid with the bill" : "Paid"} · ${methodWord(pay.method)}${
                pay.userName ? ` · ${pay.userName}` : ""
              }`,
              date: `${pay.dateBs}${pay.at ? ` ${nepalTime(pay.at)}` : ""}`,
              total: null,
              paid: pay.amountPaisa,
              owed: null,
              days: "",
            },
          });
        }
      }
    }
  }

  const bills = people.flatMap((p) => p.bills);
  const owed = sum(people.map((p) => p.owedPaisa));
  return {
    fileName: one ? fileSlug("dues", one.name || "statement") : fileSlug("dues", todayAd),
    title: one ? "Dues statement" : "Dues",
    party: one
      ? {
          name: one.name || "(no name)",
          lines: [
            [one.patientNo != null ? `Patient no. ${formatPatientNo(one.patientNo)}` : "", one.phone]
              .filter(Boolean)
              .join(" · "),
          ],
        }
      : undefined,
    period: `Owed as of ${asOf}`,
    summary: one
      ? [{ label: "Owed now", paisa: owed }]
      : [
          { label: `Owed by ${people.length} ${people.length === 1 ? "person" : "people"}`, paisa: owed },
        ],
    columns: [
      { key: "what", label: one ? "Bill" : "Patient / bill", width: 33 },
      { key: "date", label: "Date", width: 19 },
      { key: "total", label: "Bill total", width: 14, money: true },
      { key: "paid", label: "Paid", width: 14, money: true },
      { key: "owed", label: "Owed", width: 14, money: true },
      { key: "days", label: "Days", width: 7, align: "right" },
    ],
    rows,
    totals: {
      what: "Total",
      date: "",
      total: sum(bills.map((b) => b.totalPaisa)),
      paid: sum(bills.map(paidOn)),
      owed,
      days: "",
    },
    emptyText: "Nobody owes anything.",
  };
}

/** A month's salary sheet (C-037): each person's gross, deductions, net, paid and left. */
export async function salaryStatement(monthBs: string): Promise<Statement> {
  const sheet = await monthSheet(monthBs);
  const t = sheet.totals;
  const rows: StatementRow[] = sheet.rows.map((r) => {
    const p = r.pay;
    return {
      cells: {
        who: [r.staff.name, r.staff.designation, r.rate.ssfEnrolled ? "SSF" : ""].filter(Boolean).join(" · "),
        gross: p.grossPaisa,
        ssf: p.ssfStaffPaisa || null,
        tax: p.sstPaisa || null,
        other: p.deductionPaisa + p.advanceRecoveredPaisa || null,
        net: p.netPaisa,
        paid: p.paidPaisa,
        left: p.leftPaisa,
      },
    };
  });
  return {
    fileName: fileSlug("salaries", monthBs),
    title: "Salary sheet",
    period: monthLabel(monthBs),
    summary: [
      { label: "Net salaries", paisa: t.netPaisa },
      { label: "Paid", paisa: t.paidPaisa },
      { label: "SSF to deposit (31%)", paisa: t.ssfStaffPaisa + t.ssfEmployerPaisa },
      { label: "Tax to deposit (1%)", paisa: t.sstPaisa },
    ],
    columns: [
      { key: "who", label: "Staff", width: 30 },
      { key: "gross", label: "Gross", width: 12, money: true },
      { key: "ssf", label: "SSF 11%", width: 10, money: true },
      { key: "tax", label: "Tax 1%", width: 9, money: true },
      { key: "other", label: "Other deductions", width: 12, money: true },
      { key: "net", label: "Net", width: 12, money: true },
      { key: "paid", label: "Paid", width: 12, money: true },
      { key: "left", label: "Left", width: 12, money: true },
    ],
    rows,
    totals: {
      who: "Total",
      gross: t.grossPaisa,
      ssf: t.ssfStaffPaisa,
      tax: t.sstPaisa,
      other: sheet.rows.reduce((x, r) => x + r.pay.deductionPaisa + r.pay.advanceRecoveredPaisa, 0),
      net: t.netPaisa,
      paid: t.paidPaisa,
      left: t.leftPaisa,
    },
    emptyText: "Nobody is on the payroll for this month.",
  };
}

/**
 * One person's salary slip for one month (C-038): earnings beside deductions,
 * the net, how it was paid, and lines to sign. Built from the same month
 * sheet row the Salaries screen shows, so the slip can't disagree with it.
 * Null when the person was not on the payroll that month.
 */
export async function salarySlip(staffId: string, monthBs: string): Promise<Statement | null> {
  const [staff, sheet] = await Promise.all([getStaff(staffId), monthSheet(monthBs)]);
  const row = sheet.rows.find((r) => r.staff.id === staffId);
  if (!staff || !row) return null;
  const p = row.pay;
  const lines = row.lines.filter((l) => !l.voided);
  const payments = row.payments.filter((pm) => !pm.voided);

  const earnings: [string, number][] = [
    ["Basic salary", p.salaryPaisa],
    ...lines.filter((l) => l.kind === "bonus").map((l): [string, number] => [l.label || "Bonus", l.amountPaisa]),
  ];
  const deductions: [string, number][] = [
    ...(p.ssfStaffPaisa ? [["Social Security Fund 11%", p.ssfStaffPaisa] as [string, number]] : []),
    ...(p.sstPaisa ? [["Social security tax 1%", p.sstPaisa] as [string, number]] : []),
    ...lines
      .filter((l) => l.kind === "deduction")
      .map((l): [string, number] => [l.label || "Deduction", l.amountPaisa]),
    ...(p.advanceRecoveredPaisa ? [["Advance recovered", p.advanceRecoveredPaisa] as [string, number]] : []),
  ];
  const deductionTotal = p.ssfStaffPaisa + p.sstPaisa + p.deductionPaisa + p.advanceRecoveredPaisa;

  const rows: StatementRow[] = Array.from(
    { length: Math.max(earnings.length, deductions.length) },
    (_, i) => ({
      cells: {
        earning: earnings[i]?.[0] ?? "",
        earned: earnings[i]?.[1] ?? null,
        deduction: deductions[i]?.[0] ?? "",
        deducted: deductions[i]?.[1] ?? null,
      },
    }),
  );
  rows.push({
    style: "total",
    cells: { earning: "Gross pay", earned: p.grossPaisa, deduction: "Total deductions", deducted: deductionTotal },
  });

  // A non-breaking space keeps रू on the same line as its amount.
  const rs = (paisa: number) => formatPaisa(paisa).replace(" ", "\u00a0");
  const notes = payments.map(
    (pm) =>
      `Paid ${rs(pm.amountPaisa)} on ${pm.dateBs} · ${payableMethodLabel(pm.method)}${pm.note ? ` · ${pm.note}` : ""}`,
  );
  if (p.leftPaisa > 0) notes.push(`Still to pay: ${rs(p.leftPaisa)}.`);
  if (p.leftPaisa < 0) notes.push(`Paid ${rs(-p.leftPaisa)} more than the net pay.`);
  if (p.ssfEmployerPaisa > 0) {
    notes.push(
      `The clinic adds its own 20% to the Social Security Fund, ${rs(p.ssfEmployerPaisa)}, not taken from this salary. ` +
        `Deposited to the fund for the month: ${rs(p.ssfStaffPaisa + p.ssfEmployerPaisa)}.`,
    );
  }
  if (row.advanceOutstandingPaisa > 0) {
    notes.push(`Advance still to recover: ${rs(row.advanceOutstandingPaisa)}.`);
  }

  return {
    fileName: fileSlug("salary-slip", staff.name, monthBs),
    title: "Salary slip",
    party: {
      name: staff.name,
      lines: [
        staff.designation,
        [staff.panNo ? `PAN: ${staff.panNo}` : "", staff.ssfNo ? `SSF No: ${staff.ssfNo}` : ""]
          .filter(Boolean)
          .join(" · "),
        staff.bankAccount ? `Bank account: ${staff.bankAccount}` : "",
      ],
    },
    period: `Salary for ${monthLabel(monthBs)}`,
    summary: [
      { label: "Gross pay", paisa: p.grossPaisa },
      { label: "Deductions", paisa: deductionTotal },
      { label: "Net pay", paisa: p.netPaisa },
      { label: p.leftPaisa > 0 ? "Paid so far" : "Paid", paisa: p.paidPaisa },
    ],
    columns: [
      { key: "earning", label: "Earnings", width: 30 },
      { key: "earned", label: "Amount", width: 18, money: true },
      { key: "deduction", label: "Deductions", width: 32 },
      { key: "deducted", label: "Amount", width: 18, money: true },
    ],
    rows,
    totals: { earning: "Net pay", earned: p.netPaisa, deduction: "", deducted: null },
    emptyText: "",
    notes,
    signatures: ["Received by", "Authorised by"],
  };
}

/** Income and expenses for a period (C-037), as the report shows it. */
export async function financialStatement(range: DateRange): Promise<Statement> {
  const f = await financialSummary(range);
  const line = (what: string, amount: number, style?: StatementRow["style"]): StatementRow => ({
    style,
    cells: { what, amount },
  });
  return {
    fileName: fileSlug("income-and-expenses", range.label),
    title: "Income and expenses",
    period: range.label,
    summary: [
      { label: "Income", paisa: f.incomePaisa },
      { label: "Costs", paisa: f.costsPaisa },
      { label: f.leftOverPaisa >= 0 ? "Left over" : "Short by", paisa: Math.abs(f.leftOverPaisa) },
    ],
    columns: [
      { key: "what", label: "", width: 70 },
      { key: "amount", label: "Rs", width: 30, money: true },
    ],
    rows: [
      line("Billed (with VAT)", f.billedPaisa),
      line("Less refunds", -f.refundsPaisa),
      line("Less VAT collected", -f.vatPaisa),
      line("Income", f.incomePaisa, "total"),
      line("Doctors' share earned", -f.doctorSharePaisa),
      line("Laboratory costs", -f.labCostPaisa),
      line("Supplies bought (without VAT, less returns)", -f.suppliesPaisa),
      line(`Salaries${f.salaryMonths.length ? ` (${f.salaryMonths.map(monthLabel).join(", ")})` : ""}`, -f.salariesPaisa),
      line("Clinic's SSF 20%", -f.ssfEmployerPaisa),
      line("Costs", -f.costsPaisa, "total"),
      line("Paid out in these dates: to doctors", f.paidOut.doctorsPaisa, "sub"),
      line("Paid out: salaries", f.paidOut.salariesPaisa, "sub"),
      line("Paid out: to suppliers", f.paidOut.suppliersPaisa, "sub"),
      line("Paid out: to laboratories", f.paidOut.laboratoriesPaisa, "sub"),
    ],
    totals: { what: f.leftOverPaisa >= 0 ? "Left over" : "Short by", amount: f.leftOverPaisa },
    emptyText: "",
  };
}
