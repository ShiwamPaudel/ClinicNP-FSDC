import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import {
  advancesOutstanding,
  getStaff,
  staffMonths,
  staffPayments,
} from "@/lib/repos/payroll";
import { monthLabel, rateFor } from "@/lib/payroll";
import { adFromIso, bsToDbText, toBS } from "@/lib/bs";
import { nepalDayIso } from "@/lib/clock";
import { formatPaisa } from "@/lib/money";
import { payableMethodLabel } from "@/lib/payables";
import { PageShell } from "@/components/app/page-shell";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PayRateButton,
  StaffFormButton,
  UndoPaymentButton,
} from "@/components/app/salaries";
import { cn } from "@/lib/cn";

/** One person: their details, salary history, every month and every payment. */
export default async function StaffMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const s = await getStaff(id);
  if (!s) notFound();
  const current = bsToDbText(toBS(adFromIso(nepalDayIso(new Date().toISOString())))).slice(0, 7);
  const [months, payments, advances] = await Promise.all([
    staffMonths(id, current),
    staffPayments(id),
    advancesOutstanding(),
  ]);
  const rate = rateFor(s.rates, current) ?? s.rates[s.rates.length - 1] ?? null;
  const advance = advances.get(id) ?? 0;

  return (
    <PageShell
      title={s.name}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/salaries/staff"
            className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-line bg-cream-50 px-4 text-[14px] font-medium text-sage-900 hover:bg-cream-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Staff
          </Link>
          <StaffFormButton
            label="Edit"
            currentMonth={current}
            staff={{
              id: s.id,
              name: s.name,
              designation: s.designation,
              phone: s.phone,
              panNo: s.panNo,
              ssfNo: s.ssfNo,
              bankAccount: s.bankAccount,
              note: s.note,
              joinedBs: s.joinedBs,
              leftBs: s.leftBs,
            }}
          />
          <PayRateButton
            staffId={s.id}
            currentMonth={current}
            current={
              rate
                ? {
                    monthlySalaryPaisa: rate.monthlySalaryPaisa,
                    ssfEnrolled: rate.ssfEnrolled,
                    sstApplies: rate.sstApplies,
                  }
                : null
            }
          />
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="grid gap-3 rounded-[10px] border border-line bg-cream-50 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Job" value={s.designation || "—"} />
          <Detail
            label="Salary now"
            value={
              rate ? `${formatPaisa(rate.monthlySalaryPaisa)}${rate.ssfEnrolled ? " · SSF" : ""}` : "—"
            }
          />
          <Detail label="Advance to recover" value={formatPaisa(Math.max(0, advance))} />
          <Detail label="Phone" value={s.phone || "—"} />
          {s.bankAccount && <Detail label="Bank account" value={s.bankAccount} />}
          {s.panNo && <Detail label="PAN" value={s.panNo} />}
          {s.ssfNo && <Detail label="SSF number" value={s.ssfNo} />}
          {s.joinedBs && <Detail label="Joined" value={s.joinedBs} />}
          {s.leftBs && <Detail label="Left" value={s.leftBs} />}
        </section>

        <section>
          <h2 className="mb-2 text-[15px] font-semibold text-sage-900">Salary history</h2>
          <div className="flex flex-wrap gap-2 text-[13px]">
            {s.rates.map((r) => (
              <span key={r.id} className="rounded-[8px] border border-line bg-cream-50 px-3 py-1.5">
                From {monthLabel(r.fromMonthBs)}:{" "}
                <span className="tnum font-medium">{formatPaisa(r.monthlySalaryPaisa)}</span>
                {r.ssfEnrolled ? " · SSF" : r.sstApplies ? " · 1% tax" : ""}
              </span>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-[15px] font-semibold text-sage-900">Months</h2>
          {months.length === 0 ? (
            <EmptyState message="No months yet." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Month</TH>
                  <TH numeric>Gross</TH>
                  <TH numeric>Deductions</TH>
                  <TH numeric>Net</TH>
                  <TH numeric>Paid</TH>
                  <TH numeric>Left</TH>
                </TR>
              </THead>
              <tbody>
                {months.map(({ monthBs, pay }) => (
                  <TR key={monthBs}>
                    <TD>
                      <Link
                        href={`/salaries?month=${monthBs}`}
                        className="text-clinic-700 hover:underline"
                      >
                        {monthLabel(monthBs)}
                      </Link>
                    </TD>
                    <TD numeric>{formatPaisa(pay.grossPaisa, false)}</TD>
                    <TD numeric>
                      {formatPaisa(
                        pay.ssfStaffPaisa + pay.sstPaisa + pay.deductionPaisa + pay.advanceRecoveredPaisa,
                        false,
                      )}
                    </TD>
                    <TD numeric className="font-medium">{formatPaisa(pay.netPaisa, false)}</TD>
                    <TD numeric>{formatPaisa(pay.paidPaisa, false)}</TD>
                    <TD
                      numeric
                      className={cn(
                        "font-semibold",
                        pay.leftPaisa > 0 ? "text-danger-600" : "text-ok-600",
                      )}
                    >
                      {pay.leftPaisa === 0 ? "Paid" : formatPaisa(pay.leftPaisa, false)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-[15px] font-semibold text-sage-900">Payments and advances</h2>
          {payments.length === 0 ? (
            <EmptyState message="Nothing paid yet." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>For</TH>
                  <TH numeric>Amount</TH>
                  <TH>How</TH>
                  <TH />
                </TR>
              </THead>
              <tbody>
                {payments.map((p) => (
                  <TR key={p.id} className={p.voided ? "text-sage-400" : undefined}>
                    <TD className="tnum">{p.dateBs}</TD>
                    <TD>
                      {p.kind === "advance" ? <Badge tone="warn">Advance</Badge> : monthLabel(p.monthBs)}
                      {p.note && <span className="ml-2 text-[12px] text-sage-500">{p.note}</span>}
                      {p.voided && <span className="ml-2 text-[12px]">Undone — {p.voidReason}</span>}
                    </TD>
                    <TD numeric className={p.voided ? "line-through" : "font-semibold"}>
                      {formatPaisa(p.amountPaisa, false)}
                    </TD>
                    <TD>{payableMethodLabel(p.method)}</TD>
                    <TD className="text-right">
                      {!p.voided && (
                        <UndoPaymentButton
                          id={p.id}
                          what={`${p.kind === "advance" ? "Advance" : "Payment"} of ${formatPaisa(p.amountPaisa)} on ${p.dateBs}`}
                        />
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">{label}</div>
      <div className="text-[14px] text-sage-900">{value}</div>
    </div>
  );
}
