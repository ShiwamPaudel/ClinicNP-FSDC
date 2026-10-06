import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { movingItems } from "@/lib/repos/reports";
import { resolveRange } from "@/lib/date-range";
import { adToIso } from "@/lib/bs";
import { formatPaisa } from "@/lib/money";
import { ReportFrame } from "@/components/app/report-frame";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export default async function MovingPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string; fy?: string }>;
}) {
  await requireAdmin();
  await requireModulePage("pharmacy");
  const sp = await searchParams;
  const range = resolveRange(sp);
  const rows = await movingItems(range.fromIso, range.toIso, adToIso(new Date()));

  return (
    <ReportFrame
      fy={sp.fy}
      title="Fast / slow moving"
      rangeLabel={range.label}
      preset={range.preset}
      exportReport="moving"
    >
      {rows.length === 0 ? (
        <EmptyState message="No items yet." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH numeric>Qty sold</TH>
              <TH numeric>Value sold</TH>
              <TH>Movement</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((r, i) => (
              <TR key={i}>
                <TD className="font-medium text-sage-900">{r.brandName}</TD>
                <TD numeric>{r.qtySold}</TD>
                <TD numeric>{formatPaisa(r.valuePaisa, false)}</TD>
                <TD>
                  {r.deadStock ? (
                    <Badge tone="danger">No sales in 90 days</Badge>
                  ) : r.qtySold > 0 ? (
                    <Badge tone="ok">Moving</Badge>
                  ) : (
                    <Badge tone="warn">Slow</Badge>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </ReportFrame>
  );
}
