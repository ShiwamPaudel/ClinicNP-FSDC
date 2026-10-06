import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { serviceRevenue } from "@/lib/repos/clinic-reports";
import { resolveRange } from "@/lib/date-range";
import { formatPaisa } from "@/lib/money";
import { ReportFrame } from "@/components/app/report-frame";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export default async function ServiceRevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string; fy?: string }>;
}) {
  await requireAdmin();
  await requireModulePage("clinic");

  const sp = await searchParams;
  const range = resolveRange(sp);
  const rows = await serviceRevenue(range);

  const net = rows.reduce((s, r) => s + r.netPaisa, 0);
  const cost = rows.reduce((s, r) => s + r.partnerCostPaisa, 0);

  return (
    <ReportFrame
      fy={sp.fy}
      title="Service revenue"
      rangeLabel={range.label}
      preset={range.preset}
      exportReport="service-revenue"
    >
      {rows.length === 0 ? (
        <EmptyState message="No services were billed in this period." />
      ) : (
        <div className="rounded-[10px] border border-line bg-cream-50">
          <Table>
            <THead>
              <TR>
                <TH>Service</TH>
                <TH>Group</TH>
                <TH className="text-right">Times</TH>
                <TH className="text-right">Billed</TH>
                <TH className="text-right">Refunded</TH>
                <TH className="text-right">Kept</TH>
                <TH className="text-right">Paid to a laboratory</TH>
                <TH className="text-right">Left over</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.serviceId + r.name}>
                  <TD className="font-medium text-sage-900">{r.name}</TD>
                  <TD className="text-sage-500">{r.groupName}</TD>
                  <TD className="text-right tnum">{r.count}</TD>
                  <TD className="text-right tnum">{formatPaisa(r.grossPaisa)}</TD>
                  <TD className="text-right tnum text-danger-600">
                    {r.refundedPaisa > 0 ? formatPaisa(r.refundedPaisa) : "—"}
                  </TD>
                  <TD className="text-right tnum font-medium">
                    {formatPaisa(r.netPaisa)}
                  </TD>
                  <TD className="text-right tnum text-sage-500">
                    {r.partnerCostPaisa > 0 ? formatPaisa(r.partnerCostPaisa) : "—"}
                  </TD>
                  <TD className="text-right tnum">{formatPaisa(r.marginPaisa)}</TD>
                </TR>
              ))}
              <TR>
                <TD className="font-semibold text-sage-900">Total</TD>
                <TD />
                <TD />
                <TD />
                <TD />
                <TD className="text-right tnum font-semibold">{formatPaisa(net)}</TD>
                <TD className="text-right tnum font-semibold">{formatPaisa(cost)}</TD>
                <TD className="text-right tnum font-semibold">
                  {formatPaisa(net - cost)}
                </TD>
              </TR>
            </tbody>
          </Table>
        </div>
      )}
      <p className="mt-3 text-[12px] text-sage-500">
        Every figure is what was actually charged at the time. Changing a
        service&apos;s price today does not move any of these numbers.
      </p>
    </ReportFrame>
  );
}
