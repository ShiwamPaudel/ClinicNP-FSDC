import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { diagnosticsUtilisation } from "@/lib/repos/clinic-reports";
import { resolveRange } from "@/lib/date-range";
import { formatPaisa } from "@/lib/money";
import { ReportFrame } from "@/components/app/report-frame";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export default async function UtilisationPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    fy?: string;
  }>;
}) {
  await requireAdmin();
  await requireModulePage("clinic");

  const sp = await searchParams;
  const range = resolveRange(sp);
  const rows = await diagnosticsUtilisation(range);
  const total = rows.reduce((s, r) => s + r.netPaisa, 0);

  return (
    <ReportFrame
      fy={sp.fy}
      title="Diagnostics utilisation"
      rangeLabel={range.label}
      preset={range.preset}
      exportReport="utilisation"
    >
      {rows.length === 0 ? (
        <EmptyState message="No services were billed in this period." />
      ) : (
        <div className="rounded-[10px] border border-line bg-cream-50">
          <Table>
            <THead>
              <TR>
                <TH>Department</TH>
                <TH className="text-right">Times</TH>
                <TH className="text-right">Kept</TH>
                <TH>Share of the takings</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((r) => {
                const share = total > 0 ? (r.netPaisa / total) * 100 : 0;
                return (
                  <TR key={r.groupName}>
                    <TD className="font-medium text-sage-900">{r.groupName}</TD>
                    <TD className="text-right tnum">{r.count}</TD>
                    <TD className="text-right tnum">{formatPaisa(r.netPaisa)}</TD>
                    <TD>
                      {/* The bar is decoration; the number beside it is the
                          fact, so this reads without colour or width. */}
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-1.5 rounded-[999px] bg-clinic-500"
                          style={{ width: `${Math.max(2, share * 1.6)}px` }}
                        />
                        <span className="tnum text-[13px] text-sage-600">
                          {share.toFixed(0)}%
                        </span>
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}
    </ReportFrame>
  );
}
