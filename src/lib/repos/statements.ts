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
