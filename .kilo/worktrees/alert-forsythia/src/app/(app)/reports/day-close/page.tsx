import { requireUser } from "@/lib/session";
import { daySummary } from "@/lib/repos/reports";
import { resolveRange } from "@/lib/date-range";
import { adFromIso, toBS, formatBS } from "@/lib/bs";
import { formatPaisa } from "@/lib/money";
import { ReportFrame } from "@/components/app/report-frame";
import { getModules } from "@/lib/modules";

export default async function DayClosePage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string; fy?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const range = resolveRange({ preset: sp.preset ?? "today", from: sp.from, to: sp.to });
  const day = range.toIso; // day-close is a single day
  const [summary, modules] = await Promise.all([daySummary(day), getModules()]);
  const dayBs = formatBS(toBS(adFromIso(day)), { form: "long", monthScript: "en" });

  return (
    <ReportFrame
      fy={sp.fy}
      title="Day-close"
      rangeLabel={dayBs}
      preset={range.preset}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[10px] border border-line bg-cream-50 p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-sage-900">Sales</h2>
          <Line label="Bills issued" value={String(summary.billCount)} />
          <Line label="Gross sales" value={formatPaisa(summary.grossSalesPaisa)} />
          <Line label="Discounts" value={formatPaisa(summary.billDiscountPaisa)} />
          <Line label="Returns" value={`− ${formatPaisa(summary.returnsPaisa, false)}`} />
          <div className="mt-2 border-t border-line pt-2 text-[16px] font-semibold">
            <Line label="Net sales" value={formatPaisa(summary.netSalesPaisa)} />
          </div>
        </div>

        <div className="rounded-[10px] border border-line bg-cream-50 p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-sage-900">
            By payment method
          </h2>
          <Line label="Cash" value={formatPaisa(summary.byMethod.cash)} />
          <Line label="QR / wallet" value={formatPaisa(summary.byMethod.qr)} />
          <Line label="Left on dues" value={formatPaisa(summary.byMethod.credit)} />
          {(summary.duesReceived.cash > 0 || summary.duesReceived.qr > 0) && (
            <div className="mt-2 border-t border-line pt-2">
              <Line
                label="Dues paid back in cash"
                value={formatPaisa(summary.duesReceived.cash)}
              />
              <Line
                label="Dues paid back by QR / wallet"
                value={formatPaisa(summary.duesReceived.qr)}
              />
            </div>
          )}
          {summary.returnsPaisa > 0 && (
            <div className="mt-2 border-t border-line pt-2">
              <Line
                label="Handed back for returns"
                value={`− ${formatPaisa(summary.returnsPaisa - summary.returnsAgainstDuePaisa, false)}`}
              />
              {summary.returnsAgainstDuePaisa > 0 && (
                <Line
                  label="Returns taken off dues"
                  value={formatPaisa(summary.returnsAgainstDuePaisa)}
                />
              )}
            </div>
          )}
          <div className="mt-3 rounded-[8px] bg-sage-75 p-3">
            <Line
              label="Expected cash in drawer"
              value={formatPaisa(summary.expectedCashPaisa)}
              bold
            />
          </div>
          <p className="mt-2 text-[12px] text-sage-500">
            Cash from today&apos;s bills and dues paid back in cash, less what
            was handed back for returns.
          </p>
        </div>

        {modules.clinic && (
          <div className="rounded-[10px] border border-line bg-cream-50 p-5">
            <h2 className="mb-3 text-[15px] font-semibold text-sage-900">
              Where it came from
            </h2>
            {modules.pharmacy && (
              <Line
                label="Medicines"
                value={formatPaisa(summary.split.medicinesPaisa)}
              />
            )}
            <Line
              label="Consultations"
              value={formatPaisa(summary.split.consultationPaisa)}
            />
            <Line
              label="Diagnostics"
              value={formatPaisa(summary.split.diagnosticsPaisa)}
            />
            <Line
              label="Laboratory"
              value={formatPaisa(summary.split.laboratoryPaisa)}
            />
            <div className="mt-2 border-t border-line pt-2 text-[16px] font-semibold">
              <Line
                label="Together"
                value={formatPaisa(
                  summary.split.medicinesPaisa +
                    summary.split.consultationPaisa +
                    summary.split.diagnosticsPaisa +
                    summary.split.laboratoryPaisa,
                )}
              />
            </div>
            <p className="mt-2 text-[12px] text-sage-500">
              These four add up to the net sales figure, with refunds already
              taken off each one.
            </p>
          </div>
        )}
      </div>
    </ReportFrame>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    // gap-3 so a long label and its figure never touch on a narrow screen
    <div className="flex justify-between gap-3 py-1 text-[14px]">
      <span className={bold ? "font-semibold text-sage-900" : "text-sage-600"}>
        {label}
      </span>
      <span
        className={`tnum whitespace-nowrap ${bold ? "font-semibold text-sage-900" : "text-sage-900"}`}
      >
        {value}
      </span>
    </div>
  );
}
