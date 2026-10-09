import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { listStaff } from "@/lib/repos/payroll";
import { rateFor, monthLabel } from "@/lib/payroll";
import { adFromIso, bsToDbText, toBS } from "@/lib/bs";
import { nepalDayIso } from "@/lib/clock";
import { formatPaisa } from "@/lib/money";
import { PageShell } from "@/components/app/page-shell";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StaffFormButton } from "@/components/app/salaries";

export const metadata = { title: "Staff" };

/** Everyone paid a salary, with or without a login (C-037). Owner only. */
export default async function StaffPage() {
  await requireAdmin();
  const current = bsToDbText(toBS(adFromIso(nepalDayIso(new Date().toISOString())))).slice(0, 7);
  const staff = await listStaff();

  return (
    <PageShell
      title="Staff"
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/salaries"
            className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-line bg-cream-50 px-4 text-[14px] font-medium text-sage-900 hover:bg-cream-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Salaries
          </Link>
          <StaffFormButton currentMonth={current} label="Add staff" />
        </div>
      }
    >
      {staff.length === 0 ? (
        <EmptyState icon={Users} message="No staff yet. Add the people you pay a salary to." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Job</TH>
              <TH numeric>Salary now</TH>
              <TH>Since</TH>
              <TH />
            </TR>
          </THead>
          <tbody>
            {staff.map((s) => {
              const rate = rateFor(s.rates, current) ?? s.rates[s.rates.length - 1] ?? null;
              return (
                <TR key={s.id}>
                  <TD>
                    <Link
                      href={`/salaries/staff/${s.id}`}
                      className="font-medium text-sage-900 hover:text-sage-600"
                    >
                      {s.name}
                    </Link>
                    {s.leftBs && (
                      <Badge tone="neutral" className="ml-2">
                        Left {s.leftBs}
                      </Badge>
                    )}
                  </TD>
                  <TD>{s.designation || "—"}</TD>
                  <TD numeric>{rate ? formatPaisa(rate.monthlySalaryPaisa, false) : "—"}</TD>
                  <TD>{rate ? monthLabel(rate.fromMonthBs) : "—"}</TD>
                  <TD className="text-right">{rate?.ssfEnrolled && <Badge tone="info">SSF</Badge>}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </PageShell>
  );
}
