import Link from "next/link";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { monthSheet } from "@/lib/repos/payroll";
import { isMonth, monthLabel, shiftMonth } from "@/lib/payroll";
import { adFromIso, bsToDbText, toBS } from "@/lib/bs";
import { nepalDayIso } from "@/lib/clock";
import { formatPaisa } from "@/lib/money";
import { PageShell } from "@/components/app/page-shell";
import { SalarySheet } from "@/components/app/salaries";
import { StatementDownload } from "@/components/app/statement-download";

export const metadata = { title: "Salaries" };

/**
 * Salaries — one BS month at a time: what each person is due, what has been
 * paid, and what is left; bonuses, deductions, advances, SSF and the 1% tax
 * worked out on the way (C-037). Owner only.
 */
export default async function SalariesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const todayBs = bsToDbText(toBS(adFromIso(nepalDayIso(new Date().toISOString()))));
  const current = todayBs.slice(0, 7);
  const month = sp.month && isMonth(sp.month) ? sp.month : current;
  const sheet = await monthSheet(month);
  const t = sheet.totals;
  const ssf = t.ssfStaffPaisa + t.ssfEmployerPaisa;

  return (
    <PageShell
      title="Salaries"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <StatementDownload href={`/api/statement/salary?month=${month}`} />
          <Link
            href="/salaries/staff"
            className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-line bg-cream-50 px-4 text-[14px] font-medium text-sage-900 hover:bg-cream-200"
          >
            <Users className="h-4 w-4" />
            Staff
          </Link>
        </div>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <Link
          href={`/salaries?month=${shiftMonth(month, -1)}`}
          aria-label="Month before"
          className="rounded-[8px] border border-line bg-cream-50 p-2 hover:bg-cream-200"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <h2 className="min-w-[150px] text-center text-[17px] font-semibold text-sage-900">
          {monthLabel(month)}
        </h2>
        <Link
          href={`/salaries?month=${shiftMonth(month, 1)}`}
          aria-label="Month after"
          className="rounded-[8px] border border-line bg-cream-50 p-2 hover:bg-cream-200"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
        {month !== current && (
          <Link href="/salaries" className="ml-2 text-[13px] text-clinic-700 hover:underline">
            This month
          </Link>
        )}
      </div>

      {sheet.rows.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Net salaries" value={t.netPaisa} />
          <Tile label="Paid" value={t.paidPaisa} />
          <Tile label="Left to pay" value={Math.max(0, t.leftPaisa)} strong />
          <Tile
            label="To deposit"
            value={ssf + t.sstPaisa}
            hint={[
              ssf > 0 ? `SSF ${formatPaisa(ssf, false)}` : "",
              t.sstPaisa > 0 ? `Tax ${formatPaisa(t.sstPaisa, false)}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        </div>
      )}

      <SalarySheet monthBs={month} rows={sheet.rows} todayBs={todayBs} />

      <p className="mt-3 text-[12px] text-sage-500">
        SSF is 11% of the salary from the staff member and 20% from the clinic.
        Staff not on the fund pay 1% social security tax. Income tax above the
        first slab isn&apos;t worked out: add it as a deduction.
      </p>
    </PageShell>
  );
}

function Tile({
  label,
  value,
  strong,
  hint,
}: {
  label: string;
  value: number;
  strong?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-[10px] border border-line bg-cream-50 p-4">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">{label}</div>
      <div
        className={
          strong
            ? "mt-1 tnum text-[22px] font-bold text-sage-900"
            : "mt-1 tnum text-[18px] font-semibold text-sage-900"
        }
      >
        {formatPaisa(value)}
      </div>
      {hint && <div className="mt-0.5 text-[12px] text-sage-500">{hint}</div>}
    </div>
  );
}
