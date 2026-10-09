import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { financialSummary } from "@/lib/repos/financials";
import { resolveRange } from "@/lib/date-range";
import { formatPaisa } from "@/lib/money";
import { monthLabel } from "@/lib/payroll";
import { ReportFrame } from "@/components/app/report-frame";
import { StatementDownload } from "@/components/app/statement-download";
import { cn } from "@/lib/cn";

/**
 * Income and expenses — what came in, what it cost, and what is left, for the
 * dates chosen (C-037). Each line comes from the report that owns it and links
 * there.
 */
export default async function FinancialsPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string; fy?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange(sp);
  const f = await financialSummary(range);
  const qs = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => typeof v === "string" && v) as [string, string][],
  ).toString();

  return (
    <ReportFrame fy={sp.fy} title="Income and expenses" rangeLabel={range.label} preset={range.preset}>
      <div className="mb-4">
        <StatementDownload href={`/api/statement/financials${qs ? `?${qs}` : ""}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-[10px] border border-line bg-cream-50 p-5">
          <Line label="Billed (with VAT)" value={f.billedPaisa} href="/reports/sales-register" />
          <Line label="Refunds" value={-f.refundsPaisa} />
          <Line label="VAT collected (the government's)" value={-f.vatPaisa} href="/reports/vat" />
          <Line label="Income" value={f.incomePaisa} total />

          <div className="mt-4" />
          <Line label="Doctors' share earned" value={-f.doctorSharePaisa} href="/reports/doctors" />
          <Line label="Laboratory costs" value={-f.labCostPaisa} href="/reports/lab-partners" />
          <Line label="Supplies bought (without VAT, less returns)" value={-f.suppliesPaisa} href="/reports/purchase-register" />
          <Line
            label={`Salaries${f.salaryMonths.length ? ` (${f.salaryMonths.map(monthLabel).join(", ")})` : ""}`}
            value={-f.salariesPaisa}
            href="/salaries"
          />
          {f.ssfEmployerPaisa > 0 && <Line label="Clinic's SSF 20%" value={-f.ssfEmployerPaisa} />}
          <Line label="Costs" value={-f.costsPaisa} total />

          <div className="mt-4 flex items-baseline justify-between border-t-2 border-sage-900 pt-3">
            <span className="text-[16px] font-bold text-sage-900">
              {f.leftOverPaisa >= 0 ? "Left over" : "Short by"}
            </span>
            <span
              className={cn(
                "tnum text-[20px] font-bold",
                f.leftOverPaisa >= 0 ? "text-ok-600" : "text-danger-600",
              )}
            >
              {formatPaisa(Math.abs(f.leftOverPaisa))}
            </span>
          </div>
        </section>

        <aside className="rounded-[10px] border border-line bg-cream-50 p-5">
          <h2 className="mb-2 text-[14px] font-semibold text-sage-900">Paid out in these dates</h2>
          <Small label="To doctors" value={f.paidOut.doctorsPaisa} href="/payables" />
          <Small label="Salaries" value={f.paidOut.salariesPaisa} href="/salaries" />
          <Small label="To suppliers" value={f.paidOut.suppliersPaisa} href="/payables" />
          <Small label="To laboratories" value={f.paidOut.laboratoriesPaisa} href="/payables" />
          <p className="mt-3 text-[12px] text-sage-500">
            The summary counts a cost when it is earned or owed. This side is the
            money that actually went out.
          </p>
        </aside>
      </div>

      <p className="mt-3 text-[12px] text-sage-500">
        Salaries count the BS months that start inside these dates. Doctors&apos;
        shares count only where a share is set for the doctor.
      </p>
    </ReportFrame>
  );
}

function Line({
  label,
  value,
  href,
  total,
}: {
  label: string;
  value: number;
  href?: string;
  total?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-1.5 text-[14px]",
        total && "border-t border-line font-semibold text-sage-900",
      )}
    >
      {href ? (
        <Link href={href} className="text-sage-700 hover:text-clinic-700 hover:underline">
          {label}
        </Link>
      ) : (
        <span className={total ? undefined : "text-sage-700"}>{label}</span>
      )}
      <span className="tnum">
        {value < 0 ? "− " : ""}
        {formatPaisa(Math.abs(value), false)}
      </span>
    </div>
  );
}

function Small({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <div className="flex justify-between py-1 text-[13.5px]">
      <Link href={href} className="text-sage-700 hover:underline">
        {label}
      </Link>
      <span className="tnum">{formatPaisa(value, false)}</span>
    </div>
  );
}
