import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/app/header";
import { RangePicker } from "@/components/app/range-picker";
import { ExportButton } from "@/components/app/export-button";
import { requireUser } from "@/lib/session";
import {
  FiscalYearBar,
  ClosedYearBanner,
  resolveFiscalYear,
} from "@/components/app/fiscal-year-bar";

/**
 * Standard report frame: header, back link, range presets, optional export,
 * plus the fiscal-year selector and the closed-year banner. Every report gets
 * the year controls from here, so no report can quietly miss them.
 */
export async function ReportFrame({
  title,
  rangeLabel,
  preset,
  exportReport,
  showRange = true,
  showFiscalYear = true,
  fy,
  children,
}: {
  title: string;
  rangeLabel: string;
  preset?: string;
  exportReport?: string;
  showRange?: boolean;
  /** False for point-in-time stock reports, which have no year dimension. */
  showFiscalYear?: boolean;
  /** The `fy` search param, when the page passes one through. */
  fy?: string;
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const year = await resolveFiscalYear(fy);

  return (
    <>
      <Header title={title} />
      <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/reports"
            className="flex items-center gap-1.5 text-[13px] text-sage-500 hover:text-sage-700"
          >
            <ArrowLeft className="h-4 w-4" />
            All reports
          </Link>
          <div className="flex items-center gap-2">
            {showFiscalYear && (
              <FiscalYearBar role={user.role} current={year.label} />
            )}
            {exportReport && <ExportButton report={exportReport} />}
          </div>
        </div>
        {showFiscalYear && year.isClosed && (
          <ClosedYearBanner label={year.label} />
        )}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {showRange ? (
            <RangePicker current={preset ?? ""} />
          ) : (
            <span />
          )}
          <span className="text-[13px] text-sage-500">{rangeLabel}</span>
        </div>
        {children}
      </main>
    </>
  );
}
