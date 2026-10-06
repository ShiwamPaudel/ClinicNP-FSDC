import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { profitByItem } from "@/lib/repos/reports";
import { resolveRange } from "@/lib/date-range";
import { formatPaisa } from "@/lib/money";
import { ReportFrame } from "@/components/app/report-frame";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export default async function ProfitPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string; fy?: string }>;
}) {
  await requireAdmin();
  await requireModulePage("pharmacy");
  const sp = await searchParams;
  const range = resolveRange(sp);
  const { rows, totals } = await profitByItem(range.fromIso, range.toIso);

  return (
    <ReportFrame
      fy={sp.fy}
      title="Profit margin"
      rangeLabel={range.label}
      preset={range.preset}
      exportReport="profit"
    >
      {rows.length === 0 ? (
        <EmptyState message="No sales in this range." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH numeric>Qty sold</TH>
              <TH numeric>Revenue</TH>
              <TH numeric>Cost</TH>
              <TH numeric>Profit</TH>
              <TH numeric>Margin</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((r, i) => (
              <TR key={i}>
                <TD className="font-medium text-sage-900">{r.brandName}</TD>
                <TD numeric>{r.qty}</TD>
                <TD numeric>{formatPaisa(r.revenuePaisa, false)}</TD>
                <TD numeric>{formatPaisa(r.costPaisa, false)}</TD>
                <TD numeric>{formatPaisa(r.profitPaisa, false)}</TD>
                <TD numeric>{r.marginPct}%</TD>
              </TR>
            ))}
            <TR className="font-semibold">
              <TD className="text-sage-900">Total</TD>
              <TD numeric>{totals.qty}</TD>
              <TD numeric>{formatPaisa(totals.revenuePaisa, false)}</TD>
              <TD numeric>{formatPaisa(totals.costPaisa, false)}</TD>
              <TD numeric>{formatPaisa(totals.profitPaisa, false)}</TD>
              <TD numeric>{totals.marginPct}%</TD>
            </TR>
          </tbody>
        </Table>
      )}
    </ReportFrame>
  );
}
